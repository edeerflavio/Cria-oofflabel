"""
routers/analyze.py — Analyze Endpoint
Medical Scribe Enterprise v3.0
POST /analyze: text in → SOAP + documents out (local processing, no OpenAI)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

from core.security import process_patient_input
from services.soap_engine import process as soap_process
from services.documents import generate_all

logger = logging.getLogger("medical-scribe")

router = APIRouter(prefix="/api", tags=["analyze"])


# ── Request / Response Models ──

class AnalyzeRequest(BaseModel):
    nome_completo: str
    idade: int
    cenario_atendimento: str
    texto_transcrito: str


class AnalyzeResponse(BaseModel):
    success: bool
    patient: dict | None = None
    soap: dict | None = None
    clinicalData: dict | None = None
    jsonUniversal: dict | None = None
    dialog: list[dict] = []
    metadata: dict | None = None
    documents: dict | None = None
    errors: list[str] | None = None


# ══════════════════════════════════════════════════════════════
# POST /api/analyze
# ══════════════════════════════════════════════════════════════

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Full analysis pipeline:
    1. LGPD: sanitize patient identity
    2. SOAP: process transcription → structured clinical data
    3. Documents: generate prescription, attestation, exams, patient guide
    """
    try:
        # 1. LGPD compliance — sanitize patient data
        lgpd_result = process_patient_input({
            "nome_completo": request.nome_completo,
            "idade": request.idade,
            "cenario_atendimento": request.cenario_atendimento,
            "texto_transcrito": request.texto_transcrito,
        })

        if not lgpd_result.get("success"):
            return AnalyzeResponse(
                success=False,
                errors=lgpd_result.get("errors", ["Erro na validação LGPD"]),
            )

        patient_data = lgpd_result["data"]
        logger.info(f"LGPD OK: {patient_data['iniciais']} ({patient_data['paciente_id']})")

        # 2. SOAP processing — local engine (same logic as soap-engine.js)
        soap_result = soap_process(request.texto_transcrito)

        if not soap_result.get("success"):
            return AnalyzeResponse(
                success=False,
                errors=[soap_result.get("error", "Erro no processamento SOAP")],
            )

        logger.info(
            f"SOAP OK: CID={soap_result['clinicalData']['cid_principal']['code']}, "
            f"Gravidade={soap_result['clinicalData']['gravidade']}"
        )

        # 3. Document generation
        documents = generate_all(soap_result, patient_data)
        logger.info(f"Docs OK: {len(documents)} documents generated")

        # 4. Build response
        return AnalyzeResponse(
            success=True,
            patient=patient_data,
            soap=soap_result["soap"],
            clinicalData=soap_result["clinicalData"],
            jsonUniversal=soap_result["jsonUniversal"],
            dialog=soap_result["dialog"],
            metadata=soap_result["metadata"],
            documents=documents,
        )

    except Exception as e:
        logger.error(f"Analyze error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
