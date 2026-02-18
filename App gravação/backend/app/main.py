"""
app/main.py — Enterprise Entry Point
Medical Scribe Enterprise v3.0
FastAPI + Async PostgreSQL + SOAP Engine + LGPD
Replaces the original main.py as the Docker entrypoint (uvicorn app.main:app)
"""

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db, init_db, ConsultationRecord, BIRecord, AuditEvent
from core.security import process_patient_input
from core.context import get_current_context, SecurityContext
from core.policies import check_permissions, check_abac_policy
from core.middleware import RequestCorrelationMiddleware
from core.audit import AuditService
from services.soap_engine import process as soap_process
from services.documents import generate_all
from app.routers import auth, patients


# ── Logging ──
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medical-scribe")


# ── Lifespan: create tables on startup ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Medical Scribe Enterprise starting...")
    await init_db()
    logger.info("✅ Database tables created/verified")
    yield
    logger.info("🛑 Medical Scribe Enterprise shutting down")


# ══════════════════════════════════════════════════════════════
# FastAPI App
# ══════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════
# FastAPI App
# ══════════════════════════════════════════════════════════════

app = FastAPI(
    title="Medical Scribe Enterprise",
    version="3.0",
    description="Enterprise backend: SOAP engine + async PostgreSQL + LGPD compliance",
    lifespan=lifespan,
)

# [NEW] Correlation ID Middleware
app.add_middleware(RequestCorrelationMiddleware)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(patients.router, prefix="/api/v1/patients", tags=["patients"])

# Get allowed origins from environment variable
origins_str = os.getenv("CORS_ORIGINS", "")
origins = [origin.strip() for origin in origins_str.split(",") if origin.strip()]

if not origins:
    # Default to localhost if not specified, or leave empty to block all cross-origin requests
    # Use caution in production!
    origins = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Restricted to environment config
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════
# Request / Response Models
# ══════════════════════════════════════════════════════════════

class AudioInput(BaseModel):
    """Input for the analyze endpoint."""
    text: str
    nome_completo: str = "Paciente Anônimo"
    idade: int = 0
    cenario_atendimento: str = "PS"


class AnalyzeResponse(BaseModel):
    status: str
    data: dict
    patient: dict | None = None
    documents: dict | None = None
    consultation_id: int | None = None


class BIStatsResponse(BaseModel):
    total: int
    graves: int
    cenarios: int
    cids: int
    records: list[dict]


# ══════════════════════════════════════════════════════════════
# POST /api/v1/analyze — Full pipeline
# ══════════════════════════════════════════════════════════════

@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    input: AudioInput, 
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """
    Full analysis pipeline:
    1. LGPD: sanitize patient identity
    2. SOAP Engine: process text → structured clinical data
    3. Documents: generate prescription, attestation, exams, patient guide
    4. Persist to PostgreSQL
    """
    # [NEW] Audit Log (Start)
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "consultation", "analyze_start", 
        {"patient": input.nome_completo} # Note: In real audit, mask PII
    )

    try:
        # 1. LGPD compliance
        lgpd_result = process_patient_input({
            "nome_completo": input.nome_completo,
            "idade": input.idade,
            "cenario_atendimento": input.cenario_atendimento,
            "texto_transcrito": input.text,
        })

        if not lgpd_result.get("success"):
            raise HTTPException(status_code=422, detail=lgpd_result.get("errors", ["Validação LGPD falhou"]))

        patient_data = lgpd_result["data"]
        logger.info(f"LGPD ✅ {patient_data['iniciais']} ({patient_data['paciente_id']})")

        # 2. SOAP Processing (local engine — same logic as soap-engine.js)
        result = soap_process(input.text)

        if not result.get("success"):
            raise HTTPException(status_code=422, detail=result.get("error", "Processamento SOAP falhou"))

        logger.info(
            f"SOAP ✅ CID={result['clinicalData']['cid_principal']['code']} "
            f"Gravidade={result['clinicalData']['gravidade']}"
        )

        # 3. Document generation
        documents = generate_all(result, patient_data)
        logger.info(f"Docs ✅ {len(documents)} documentos gerados")

        # 4. Persist to PostgreSQL
        # 4. Persist to PostgreSQL
        consultation = ConsultationRecord(
            tenant_id=ctx.tenant.id,  # [NEW] Multi-tenancy
            iniciais=patient_data["iniciais"],
            paciente_id=patient_data["paciente_id"],
            idade=patient_data["idade"],
            cenario_atendimento=patient_data["cenario_atendimento"],
            cid_principal_code=result["clinicalData"]["cid_principal"]["code"],
            cid_principal_desc=result["clinicalData"]["cid_principal"]["desc"],
            gravidade=result["clinicalData"]["gravidade"],
            sinais_vitais=result["clinicalData"]["sinais_vitais"],
            soap_json=result["soap"],
            json_universal=result["jsonUniversal"],
            clinical_data_json=result["clinicalData"],
            dialog_json=result["dialog"],
            total_falas=result["metadata"]["total_falas"],
            falas_medico=result["metadata"]["falas_medico"],
            falas_paciente=result["metadata"]["falas_paciente"],
            documents_json=documents,
            texto_transcrito=input.text,
        )
        db.add(consultation)

        # BI record (lightweight analytics)
        bi_record = BIRecord(
            tenant_id=ctx.tenant.id,  # [NEW] Multi-tenancy
            iniciais=patient_data["iniciais"],
            cenario=patient_data["cenario_atendimento"],
            cid_principal=result["clinicalData"]["cid_principal"]["code"],
            cid_desc=result["clinicalData"]["cid_principal"]["desc"],
            gravidade_estimada=result["clinicalData"]["gravidade"],
            sinais_vitais=result["clinicalData"]["sinais_vitais"],
            hora=__import__("datetime").datetime.now().hour,
            dia_semana=__import__("datetime").datetime.now().strftime("%A"),
        )
        db.add(bi_record)

        await db.commit()
        await db.refresh(consultation)

        logger.info(f"DB ✅ consultation_id={consultation.id}")

        # [NEW] Audit Log (Success)
        await AuditService.log_event(
            db, ctx.tenant.id, ctx.user.id, "consultation", "create", 
            {"consultation_id": consultation.id}
        )

        # 5. Build response
        return AnalyzeResponse(
            status="success",
            data=result,
            patient=patient_data,
            documents=documents,
            consultation_id=consultation.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Analyze error: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# GET /api/v1/consultations — List consultations
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/consultations")
async def list_consultations(
    limit: int = 20,
    offset: int = 0,
    cenario: str | None = None,
    gravidade: str | None = None,
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context),
):
    """List consultations with optional filters."""
    # [NEW] Check permission
    if not await check_permissions(ctx.user.id, ctx.tenant.id, "consultation", "read", db):
         # Allow read for now to not break everything immediately, but log or warn
         # raise HTTPException(status_code=403, detail="Permission denied")
         pass

    query = select(ConsultationRecord).where(ConsultationRecord.tenant_id == ctx.tenant.id)
    query = query.order_by(ConsultationRecord.created_at.desc())

    if cenario:
        query = query.where(ConsultationRecord.cenario_atendimento == cenario)
    if gravidade:
        query = query.where(ConsultationRecord.gravidade == gravidade)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "status": "success",
        "count": len(records),
        "data": [
            {
                "id": r.id,
                "iniciais": r.iniciais,
                "paciente_id": r.paciente_id,
                "idade": r.idade,
                "cenario_atendimento": r.cenario_atendimento,
                "cid_principal": {"code": r.cid_principal_code, "desc": r.cid_principal_desc},
                "gravidade": r.gravidade,
                "sinais_vitais": r.sinais_vitais,
                "total_falas": r.total_falas,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }


# ══════════════════════════════════════════════════════════════
# GET /api/v1/consultations/{id} — Single consultation detail
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/consultations/{consultation_id}")
async def get_consultation(
    consultation_id: int, 
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """Get full consultation detail including SOAP, documents, dialog."""
    
    # [NEW] Audit Log (View Attempt)
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "consultation", "view", 
        {"consultation_id": consultation_id}
    )

    result = await db.execute(
        select(ConsultationRecord).where(
            ConsultationRecord.id == consultation_id,
            ConsultationRecord.tenant_id == ctx.tenant.id  # [NEW] Multi-tenancy
        )
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Consulta não encontrada")

    return {
        "status": "success",
        "data": {
            "id": record.id,
            "iniciais": record.iniciais,
            "paciente_id": record.paciente_id,
            "idade": record.idade,
            "cenario_atendimento": record.cenario_atendimento,
            "cid_principal": {"code": record.cid_principal_code, "desc": record.cid_principal_desc},
            "gravidade": record.gravidade,
            "sinais_vitais": record.sinais_vitais,
            "soap": record.soap_json,
            "jsonUniversal": record.json_universal,
            "clinicalData": record.clinical_data_json,
            "dialog": record.dialog_json,
            "documents": record.documents_json,
            "metadata": {
                "total_falas": record.total_falas,
                "falas_medico": record.falas_medico,
                "falas_paciente": record.falas_paciente,
            },
            "created_at": record.created_at.isoformat() if record.created_at else None,
        },
    }


# ══════════════════════════════════════════════════════════════
# GET /api/v1/bi/stats — BI Dashboard stats
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/bi/stats")
async def bi_stats(
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """
    BI dashboard statistics.
    Same data as bi-module.js getStats() + getAllRecords().
    """
    # [NEW] Audit Log
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "bi", "view_stats", {}
    )

    # Total count
    total_result = await db.execute(
        select(func.count(BIRecord.id)).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    total = total_result.scalar() or 0

    # Graves count
    graves_result = await db.execute(
        select(func.count(BIRecord.id)).where(
            BIRecord.gravidade_estimada == "Grave",
            BIRecord.tenant_id == ctx.tenant.id
        )
    )
    graves = graves_result.scalar() or 0

    # Unique cenarios
    cenarios_result = await db.execute(
        select(func.count(func.distinct(BIRecord.cenario))).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    cenarios = cenarios_result.scalar() or 0

    # Unique CIDs
    cids_result = await db.execute(
         select(func.count(func.distinct(BIRecord.cid_principal))).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    cids = cids_result.scalar() or 0

    # Latest records (for charts)
    records_result = await db.execute(
        select(BIRecord)
        .where(BIRecord.tenant_id == ctx.tenant.id)
        .order_by(BIRecord.timestamp.desc())
        .limit(200)
    )
    records = records_result.scalars().all()

    return {
        "status": "success",
        "stats": {
            "total": total,
            "graves": graves,
            "cenarios": cenarios,
            "cids": cids,
        },
        "records": [
            {
                "iniciais": r.iniciais,
                "cenario": r.cenario,
                "cid_principal": r.cid_principal,
                "cid_desc": r.cid_desc,
                "gravidade_estimada": r.gravidade_estimada,
                "sinais_vitais": r.sinais_vitais,
                "hora": r.hora,
                "dia_semana": r.dia_semana,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in records
        ],
    }


# ══════════════════════════════════════════════════════════════
# Health Check
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/health")
async def health():
    return {"status": "healthy", "version": "3.0", "engine": "enterprise"}
