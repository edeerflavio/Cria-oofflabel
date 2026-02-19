"""
app/main.py — Enterprise Entry Point
Medical Scribe Enterprise v3.0
FastAPI + Async PostgreSQL + SOAP Engine + LGPD
Replaces the original main.py as the Docker entrypoint (uvicorn app.main:app)
"""

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import tempfile

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


# ══════════════════════════════════════════════════════════════
# FastAPI App
# ══════════════════════════════════════════════════════════════

app = FastAPI(
    title="Medical Scribe Enterprise",
    version="3.0",
    description="Enterprise backend: SOAP engine + async PostgreSQL + LGPD compliance",
    lifespan=lifespan,
)

# ══════════════════════════════════════════════════════════════
# WebSocket Endpoint for Real-time Transcription
# ══════════════════════════════════════════════════════════════

@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    await websocket.accept()
    full_transcript = ""
    chunk_count = 0
    try:
        while True:
            data = await websocket.receive()
            if "text" in data:
                message = data["text"]
                if message == "stop":
                    await websocket.send_json({
                        "type": "final",
                        "text": full_transcript,
                        "chunks": chunk_count
                    })
                    break
                continue
            if "bytes" in data:
                audio_bytes = data["bytes"]
                
                if len(audio_bytes) < 1000:
                    continue
                
                chunk_count += 1
                
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name
                
                try:
                    with open(tmp_path, "rb") as audio_file:
                        transcription = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=audio_file,
                            language="pt"
                        )
                    
                    chunk_text = transcription.text.strip()
                    if chunk_text:
                        # Como recebemos o áudio acumulado completo, o resultado
                        # do Whisper já contém TODA a transcrição até o momento
                        full_transcript = chunk_text
                        
                        await websocket.send_json({
                            "type": "partial",
                            "text": chunk_text,
                            "full_text": full_transcript
                        })
                
                except Exception as chunk_error:
                    logger.warning(f"Chunk {chunk_count} falhou: {chunk_error}")
                    continue
                
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
    except WebSocketDisconnect:
        logger.info("WebSocket desconectado")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

# [NEW] Permissions Policy
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Permissions-Policy"] = "microphone=(self)"
    return response

# [NEW] Correlation ID Middleware
app.add_middleware(RequestCorrelationMiddleware)

# ── Routers ──
# from app.api.v1.endpoints import admin_stats  <-- Removed, unified into main.py
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(patients.router, prefix="/api/v1/patients", tags=["patients"])
# app.include_router(admin_stats.router, prefix="/api/v1/admin/stats", tags=["admin"]) <-- Removed

# Get allowed origins from environment variable
origins_str = os.getenv("CORS_ORIGINS", "http://localhost,http://localhost:4200")
origins = [origin.strip() for origin in origins_str.split(",") if origin.strip()]

if not origins:
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
    """Input for the analyze endpoint (JSON mode)."""
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
    # Detailed stats (unified)
    summary: dict | None = None
    pathologies: list[dict] | None = None
    demographics: dict | None = None
    top_medications: list[dict] | None = None


# ══════════════════════════════════════════════════════════════
# Whisper Transcription Service
# ══════════════════════════════════════════════════════════════

import shutil
from fastapi import UploadFile, File, Form
from typing import Optional
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def transcribe_audio(file: UploadFile) -> str:
    """
    Transcribes audio using OpenAI Whisper (Cloud).
    Saves temp file -> Whisper API -> Returns text.
    """
    try:
        # Create temp file
        temp_filename = f"temp_{file.filename}"
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"🎤 Transcribing audio: {temp_filename}")

        with open(temp_filename, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file,
                language="pt"
            )
        
        # Cleanup
        os.remove(temp_filename)
        
        return transcription.text
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        # Cleanup if exists
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        raise HTTPException(status_code=500, detail=f"Erro na transcrição: {str(e)}")


# ══════════════════════════════════════════════════════════════
# POST /api/v1/analyze — Full pipeline (Audio OR Text)
# ══════════════════════════════════════════════════════════════

@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
@app.post("/api/analyze", response_model=AnalyzeResponse, include_in_schema=False)
@app.post("/scribe/process", response_model=AnalyzeResponse, include_in_schema=False)
async def analyze(
    # Unified input: accept either File + Form OR default JSON (via other logic if we used Pydantic only)
    # Since we need to support both multipart (audio) and potentially JSON (text), 
    # FastAPI handles this best with Form/File parameters.
    # We will make input optional to support the JSON-only legacy calls if implemented, 
    # but here we prioritize the Multipart Form approach requested.
    
    file: UploadFile = File(None),
    nome_completo: str = Form("Paciente Anônimo"),
    idade: Optional[str] = Form(None), # Handle "null" or empty strings from frontend
    cenario_atendimento: str = Form("PS"),
    texto_transcrito: str = Form(""),
    
    # Original JSON body support is tricky when mixing File/Form. 
    # We assume the frontend now uses FormData for everything.
    
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """
    Full analysis pipeline:
    1. Audio Transcription (if file provided)
    2. LGPD: sanitize patient identity
    3. SOAP Engine: process text → structured clinical data
    4. Documents: generate prescription, attestation, exams, patient guide
    5. Persist to PostgreSQL
    """
    
    # Process inputs
    final_text = texto_transcrito
    
    if file:
        logger.info(f"🎤 Audio file received: {file.filename}")
        transcribed = await transcribe_audio(file)
        if transcribed:
            final_text = transcribed
            logger.info(f"📝 Transcribed text: {final_text[:50]}...")
    
    if not final_text:
        raise HTTPException(status_code=400, detail="Nenhum áudio ou texto fornecido.")

    # Parse age safely
    idade_int = 0
    if idade and str(idade).isdigit():
        idade_int = int(idade)

    # [NEW] Audit Log (Start)
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "consultation", "analyze_start", 
        {"patient": nome_completo}
    )

    try:
        # 1. LGPD compliance
        lgpd_result = process_patient_input({
            "nome_completo": nome_completo,
            "idade": idade_int,
            "cenario_atendimento": cenario_atendimento,
            "texto_transcrito": final_text,
        })

        if not lgpd_result.get("success"):
            raise HTTPException(status_code=422, detail=lgpd_result.get("errors", ["Validação LGPD falhou"]))

        patient_data = lgpd_result["data"]
        logger.info(f"LGPD ✅ {patient_data['iniciais']} ({patient_data['paciente_id']})")

        # 2. SOAP Processing (local engine — same logic as soap-engine.js)
        result = soap_process(final_text)

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
        consultation = ConsultationRecord(
            tenant_id=ctx.tenant.id,
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
            first_transcription=final_text,
        )
        db.add(consultation)

        # BI record (lightweight analytics)
        bi_record = BIRecord(
            tenant_id=ctx.tenant.id,
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
            data=result, # Contains soap, clinicalData, etc
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
    if not await check_permissions(ctx.user.id, ctx.tenant.id, "consultation", "read", db):
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
    
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "consultation", "view", 
        {"consultation_id": consultation_id}
    )

    result = await db.execute(
        select(ConsultationRecord).where(
            ConsultationRecord.id == consultation_id,
            ConsultationRecord.tenant_id == ctx.tenant.id
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
# GET /api/v1/bi/stats — UNIFIED BI + ADMIN Dashboard stats
# ══════════════════════════════════════════════════════════════

from sqlalchemy import desc

@app.get("/api/v1/bi/stats")
async def bi_stats(
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """
    Unified BI & Admin Dashboard statistics.
    Combines legacy BI stats with deep Admin aggregations.
    """
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "bi", "view_stats", {}
    )

    # 1. Basic Counts (from BIRecord)
    total_result = await db.execute(
        select(func.count(BIRecord.id)).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    total = total_result.scalar() or 0

    graves_result = await db.execute(
        select(func.count(BIRecord.id)).where(
            BIRecord.gravidade_estimada == "Grave",
            BIRecord.tenant_id == ctx.tenant.id
        )
    )
    graves = graves_result.scalar() or 0

    cenarios_result = await db.execute(
        select(func.count(func.distinct(BIRecord.cenario))).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    cenarios = cenarios_result.scalar() or 0

    cids_result = await db.execute(
         select(func.count(func.distinct(BIRecord.cid_principal))).where(BIRecord.tenant_id == ctx.tenant.id)
    )
    cids = cids_result.scalar() or 0

    # 2. Latest records (for list view)
    records_result = await db.execute(
        select(BIRecord)
        .where(BIRecord.tenant_id == ctx.tenant.id)
        .order_by(BIRecord.timestamp.desc())
        .limit(20) # Limit to 20 for lightness
    )
    records = records_result.scalars().all()

    # 3. Deep Analysis (Pathologies, Meds, Demographics)
    # Re-implemented from admin_stats.py directly here

    # Pathologies (CID-10 Grouping)
    cid_query = (
        select(
            ConsultationRecord.cid_principal_code,
            ConsultationRecord.cid_principal_desc,
            func.count(ConsultationRecord.id).label("count")
        )
        .where(ConsultationRecord.tenant_id == ctx.tenant.id)
        .group_by(ConsultationRecord.cid_principal_code, ConsultationRecord.cid_principal_desc)
        .order_by(desc("count"))
        .limit(10)
    )
    cid_result = await db.execute(cid_query)
    pathologies = [
        {"code": row.cid_principal_code, "name": row.cid_principal_desc, "count": row.count}
        for row in cid_result.all()
    ]

    # Demographics - Age Groups
    age_query = select(ConsultationRecord.idade).where(ConsultationRecord.tenant_id == ctx.tenant.id)
    age_result = await db.execute(age_query)
    ages = age_result.scalars().all()

    age_distribution = {
        "0-12": 0,
        "13-18": 0,
        "19-59": 0,
        "60+": 0
    }
    
    for age in ages:
        if age <= 12: age_distribution["0-12"] += 1
        elif age <= 18: age_distribution["13-18"] += 1
        elif age <= 59: age_distribution["19-59"] += 1
        else: age_distribution["60+"] += 1

    # Medications (Parsing JSON)
    meds_query = (
        select(ConsultationRecord.json_universal)
        .where(ConsultationRecord.tenant_id == ctx.tenant.id)
        .order_by(ConsultationRecord.created_at.desc())
        .limit(100)
    )
    meds_result = await db.execute(meds_query)
    
    med_counts = {}
    for row in meds_result.scalars().all():
        if row and "Medicações_Atuais" in row:
            meds = row["Medicações_Atuais"]
            if isinstance(meds, list):
                for med in meds:
                    name = med.split(" ")[0].upper() # Take first word
                    med_counts[name] = med_counts.get(name, 0) + 1
    
    top_medications = sorted(
        [{"name": k, "count": v} for k, v in med_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]

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
        # Unified Dashboard Keys
        "summary": {
            "total_consultations": total,
            "avg_duration_min": 15, # Placeholder
        },
        "pathologies": pathologies,
        "demographics": {
            "age_groups": age_distribution,
        },
        "top_medications": top_medications
    }


# ══════════════════════════════════════════════════════════════
# Health Check
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/health")
async def health():
    return {"status": "healthy", "version": "3.0", "engine": "enterprise"}
