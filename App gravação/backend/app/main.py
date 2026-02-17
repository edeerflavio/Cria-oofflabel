"""
app/main.py — Enterprise Entry Point
Medical Scribe Enterprise v3.0
FastAPI + Async PostgreSQL + SOAP Engine + LGPD
Replaces the original main.py as the Docker entrypoint (uvicorn app.main:app)
"""

from contextlib import asynccontextmanager
import logging
import os
import json
import base64
import hashlib
import hmac
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import (
    get_db,
    init_db,
    ConsultationRecord,
    BIRecord,
    AuditTrailRecord,
    DigitalSignatureRecord,
)
from core.security import process_patient_input
from services.soap_engine import process as soap_process
from services.documents import generate_all


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

app = FastAPI(
    title="Medical Scribe Enterprise",
    version="3.0",
    description="Enterprise backend: SOAP engine + async PostgreSQL + LGPD compliance",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: restrict to your Angular domain
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
    sexo: str = "NaoInformado"
    cenario_atendimento: str = "PS"
    consultation_started_at: datetime | None = None
    consultation_finished_at: datetime | None = None


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
async def analyze(input: AudioInput, db: AsyncSession = Depends(get_db)):
    """
    Full analysis pipeline:
    1. LGPD: sanitize patient identity
    2. SOAP Engine: process text → structured clinical data
    3. Documents: generate prescription, attestation, exams, patient guide
    4. Persist to PostgreSQL
    """
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

        duracao_consulta_segundos = None
        if input.consultation_started_at and input.consultation_finished_at:
            delta = int((input.consultation_finished_at - input.consultation_started_at).total_seconds())
            duracao_consulta_segundos = max(delta, 0)

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
        consultation = ConsultationRecord(
            iniciais=patient_data["iniciais"],
            paciente_id=patient_data["paciente_id"],
            idade=patient_data["idade"],
            sexo=input.sexo,
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
            duracao_consulta_segundos=duracao_consulta_segundos,
            documents_json=documents,
            texto_transcrito=input.text,
        )
        db.add(consultation)

        # BI record (lightweight analytics)
        bi_record = BIRecord(
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

        await _log_audit(
            db=db,
            actor_id="system",
            actor_role="engine",
            action="CONSULTATION_CREATED",
            resource_type="consultation",
            resource_id=str(consultation.id),
            consultation_id=consultation.id,
            payload={"cid": result["clinicalData"]["cid_principal"]["code"]},
        )

        logger.info(f"DB ✅ consultation_id={consultation.id}")

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
):
    """List consultations with optional filters."""
    query = select(ConsultationRecord).order_by(ConsultationRecord.created_at.desc())

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
async def get_consultation(consultation_id: int, db: AsyncSession = Depends(get_db)):
    """Get full consultation detail including SOAP, documents, dialog."""
    result = await db.execute(
        select(ConsultationRecord).where(ConsultationRecord.id == consultation_id)
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


def _admin_secret() -> str:
    return os.getenv("ADMIN_DASHBOARD_SECRET", "trocar-essa-senha-admin")


def _issue_admin_token(username: str) -> str:
    payload = {
        "sub": username,
        "role": "admin",
        "iat": int(datetime.now(tz=timezone.utc).timestamp()),
        "exp": int(datetime.now(tz=timezone.utc).timestamp()) + 8 * 3600,
    }
    data = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(_admin_secret().encode(), data, hashlib.sha256).hexdigest()
    return f"{base64.urlsafe_b64encode(data).decode()}.{sig}"


def _validate_admin_token(token: str) -> dict:
    try:
        encoded, sig = token.split(".")
        data = base64.urlsafe_b64decode(encoded.encode())
        expected_sig = hmac.new(_admin_secret().encode(), data, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=401, detail="Token admin inválido")

        payload = json.loads(data.decode())
        if payload.get("exp", 0) < int(datetime.now(tz=timezone.utc).timestamp()):
            raise HTTPException(status_code=401, detail="Token admin expirado")
        return payload
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Token admin inválido") from exc


def _require_admin(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token obrigatório")
    token = auth.split(" ", 1)[1]
    return _validate_admin_token(token)


async def _log_audit(
    db: AsyncSession,
    actor_id: str,
    actor_role: str,
    action: str,
    resource_type: str,
    resource_id: str,
    consultation_id: int | None = None,
    payload: dict | None = None,
    request: Request | None = None,
):
    last = await db.execute(select(AuditTrailRecord).order_by(AuditTrailRecord.id.desc()).limit(1))
    previous = last.scalar_one_or_none()
    previous_hash = previous.record_hash if previous else "GENESIS"
    created_at = datetime.utcnow().isoformat()
    hash_input = f"{previous_hash}|{actor_id}|{action}|{resource_type}|{resource_id}|{created_at}|{json.dumps(payload or {}, sort_keys=True)}"
    record_hash = hashlib.sha256(hash_input.encode()).hexdigest()

    rec = AuditTrailRecord(
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        consultation_id=consultation_id,
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        payload=payload,
        previous_hash=previous_hash,
        record_hash=record_hash,
    )
    db.add(rec)
    await db.commit()


class AdminLoginInput(BaseModel):
    username: str
    password: str


@app.post("/api/v1/admin/login")
async def admin_login(input: AdminLoginInput, db: AsyncSession = Depends(get_db)):
    expected_user = os.getenv("ADMIN_DASHBOARD_USER", "admin")
    expected_password = _admin_secret()
    if input.username != expected_user or input.password != expected_password:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = _issue_admin_token(input.username)
    await _log_audit(
        db=db,
        actor_id=input.username,
        actor_role="admin",
        action="ADMIN_LOGIN",
        resource_type="dashboard",
        resource_id="bi",
    )
    return {"status": "success", "token": token}


@app.get("/api/v1/admin/bi/stats")
async def admin_bi_stats(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _require_admin(request)
    consultations_result = await db.execute(select(ConsultationRecord))
    consultations = consultations_result.scalars().all()

    by_sexo = {}
    by_age_band = {"0-17": 0, "18-39": 0, "40-59": 0, "60+": 0}
    by_hour = {str(h): 0 for h in range(24)}
    cid_counts = {}
    total_duration = 0
    duration_count = 0

    for c in consultations:
        sexo = c.sexo or "NaoInformado"
        by_sexo[sexo] = by_sexo.get(sexo, 0) + 1
        if c.idade <= 17:
            by_age_band["0-17"] += 1
        elif c.idade <= 39:
            by_age_band["18-39"] += 1
        elif c.idade <= 59:
            by_age_band["40-59"] += 1
        else:
            by_age_band["60+"] += 1

        if c.created_at:
            by_hour[str(c.created_at.hour)] += 1
        cid_counts[c.cid_principal_code] = cid_counts.get(c.cid_principal_code, 0) + 1
        if c.duracao_consulta_segundos:
            total_duration += c.duracao_consulta_segundos
            duration_count += 1

    peak_hour = max(by_hour.items(), key=lambda kv: kv[1])[0] if consultations else None
    avg_duration = int(total_duration / duration_count) if duration_count else None

    await _log_audit(
        db=db,
        actor_id=admin["sub"],
        actor_role="admin",
        action="ADMIN_VIEW_STATS",
        resource_type="dashboard",
        resource_id="bi-stats",
    )

    return {
        "status": "success",
        "kpis": {
            "total_consultas": len(consultations),
            "duracao_media_segundos": avg_duration,
            "hora_pico": peak_hour,
        },
        "por_sexo": by_sexo,
        "por_faixa_etaria": by_age_band,
        "fluxo_horario": by_hour,
        "top_cids": sorted(cid_counts.items(), key=lambda kv: kv[1], reverse=True)[:10],
    }


@app.get("/api/v1/admin/bi/export.csv")
async def export_bi_csv(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _require_admin(request)
    result = await db.execute(select(ConsultationRecord).order_by(ConsultationRecord.created_at.desc()))
    records = result.scalars().all()
    lines = [
        "consultation_id,data_hora,sexo,idade,cenario,cid,gravidade,duracao_segundos"
    ]
    for r in records:
        lines.append(
            f"{r.id},{r.created_at.isoformat() if r.created_at else ''},{r.sexo or 'NaoInformado'},{r.idade},{r.cenario_atendimento},{r.cid_principal_code},{r.gravidade},{r.duracao_consulta_segundos or ''}"
        )

    await _log_audit(
        db=db,
        actor_id=admin["sub"],
        actor_role="admin",
        action="ADMIN_EXPORT_CSV",
        resource_type="dashboard",
        resource_id="bi-export",
    )

    return {
        "status": "success",
        "filename": f"bi_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
        "content": "\n".join(lines),
    }


@app.post("/api/v1/consultations/{consultation_id}/signature/prepare")
async def prepare_signature_payload(consultation_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    admin = _require_admin(request)
    result = await db.execute(select(ConsultationRecord).where(ConsultationRecord.id == consultation_id))
    consultation = result.scalar_one_or_none()
    if not consultation:
        raise HTTPException(status_code=404, detail="Consulta não encontrada")

    payload = {
        "consultation_id": consultation.id,
        "patient_id": consultation.paciente_id,
        "cid": consultation.cid_principal_code,
        "soap": consultation.soap_json,
        "created_at": consultation.created_at.isoformat() if consultation.created_at else None,
    }
    canonical_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    digest = hashlib.sha256(canonical_payload.encode()).hexdigest()

    signature = DigitalSignatureRecord(
        consultation_id=consultation.id,
        document_type="soap_bundle",
        document_hash_sha256=digest,
        canonical_payload=payload,
        certificate_hint="Preparado para token A3 ou arquivo A1 .p12",
        created_by=admin["sub"],
    )
    db.add(signature)
    await db.commit()

    await _log_audit(
        db=db,
        actor_id=admin["sub"],
        actor_role="admin",
        action="SIGNATURE_PREPARED",
        resource_type="consultation",
        resource_id=str(consultation.id),
        consultation_id=consultation.id,
        payload={"digest": digest},
    )

    return {
        "status": "success",
        "signature_id": signature.id,
        "hash_sha256": digest,
        "signature_standard": "CMS detached",
        "next_step": "Assinar hash com certificado ICP-Brasil A1 (.p12) ou A3 (token) em módulo HSM/PKCS#11.",
    }


# ══════════════════════════════════════════════════════════════
# GET /api/v1/bi/stats — BI Dashboard stats
# ══════════════════════════════════════════════════════════════

@app.get("/api/v1/bi/stats")
async def bi_stats(db: AsyncSession = Depends(get_db)):
    """
    BI dashboard statistics.
    Same data as bi-module.js getStats() + getAllRecords().
    """
    # Total count
    total_result = await db.execute(select(func.count(BIRecord.id)))
    total = total_result.scalar() or 0

    # Graves count
    graves_result = await db.execute(
        select(func.count(BIRecord.id)).where(BIRecord.gravidade_estimada == "Grave")
    )
    graves = graves_result.scalar() or 0

    # Unique cenarios
    cenarios_result = await db.execute(select(func.count(func.distinct(BIRecord.cenario))))
    cenarios = cenarios_result.scalar() or 0

    # Unique CIDs
    cids_result = await db.execute(select(func.count(func.distinct(BIRecord.cid_principal))))
    cids = cids_result.scalar() or 0

    # Latest records (for charts)
    records_result = await db.execute(
        select(BIRecord).order_by(BIRecord.timestamp.desc()).limit(200)
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



@app.get("/api/v1/admin/backup/manifest")
async def backup_manifest(request: Request, db: AsyncSession = Depends(get_db)):
    admin = _require_admin(request)
    total = (await db.execute(select(func.count(ConsultationRecord.id)))).scalar() or 0
    last = (await db.execute(select(ConsultationRecord).order_by(ConsultationRecord.created_at.desc()).limit(1))).scalar_one_or_none()

    manifest = {
        "backup_scope": "postgres_medical_scribe",
        "generated_at": datetime.utcnow().isoformat(),
        "retention_policy": "Sem retenção de áudio bruto; somente dados estruturados mínimos.",
        "total_consultations": total,
        "last_consultation_at": last.created_at.isoformat() if last and last.created_at else None,
        "runbook": [
            "pg_dump --format=custom --no-owner --file=backup.dump $DATABASE_URL",
            "gpg --encrypt --recipient equipe-seguranca@hospital.local backup.dump",
            "Teste de restauração trimestral com pg_restore em ambiente isolado"
        ]
    }

    await _log_audit(
        db=db,
        actor_id=admin["sub"],
        actor_role="admin",
        action="BACKUP_MANIFEST_VIEWED",
        resource_type="backup",
        resource_id="manifest",
    )

    return {"status": "success", "manifest": manifest}

@app.get("/api/v1/health")
async def health():
    return {"status": "healthy", "version": "3.0", "engine": "enterprise"}
