"""
main.py — EIXO Medical Scribe Backend
FastAPI + OpenAI (Whisper + GPT-4o)
Receives audio/text from frontend, returns SOAP-structured JSON
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
import os
import json
import logging
from datetime import datetime

# ── Enterprise modules ──
from routers.analyze import router as analyze_router

# ── Config ──
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medical-scribe")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI(
    title="EIXO Medical Scribe - OpenAI Edition",
    version="2.0",
    description="Backend for Medical Scribe: Whisper transcription + GPT-4o clinical structuring"
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Enterprise Router (local SOAP engine) ──
app.include_router(analyze_router)

# ══════════════════════════════════════════════════════════════
# SYSTEM PROMPT — Enforces exact JSON schema for frontend compat
# ══════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """
Você é um Escriba Médico de elite do projeto EIXO Medical Scribe. Sua função é transformar a transcrição de uma consulta médica em um JSON clínico rigoroso e completo.

## REGRAS ABSOLUTAS:
1. Responda APENAS com JSON válido, sem texto adicional, sem markdown.
2. Siga EXATAMENTE o schema abaixo — não invente campos novos.
3. As chaves devem ser escritas EXATAMENTE como mostrado (case-sensitive).
4. Extraia TODOS os sinais vitais mencionados (PA, FC, SatO2, FR, Temperatura).
5. Identifique o CID-10 principal com base nos sintomas e diagnósticos.
6. Destaque ALERGIAS EM CAIXA ALTA no campo Alergias.
7. Se um dado não estiver presente na transcrição, use null para objetos e string vazia "" para textos.
8. Arrays vazios [] quando não houver dados (Alergias, Comorbidades, Medicações_Atuais).

## SCHEMA JSON OBRIGATÓRIO (respeite CADA chave exatamente):

{
  "success": true,
  "soap": {
    "subjetivo": {
      "title": "Subjetivo (S)",
      "icon": "🗣️",
      "content": "Texto narrativo rico com queixa principal, HDA, antecedentes pessoais e familiares."
    },
    "objetivo": {
      "title": "Objetivo (O)",
      "icon": "🔍",
      "content": "Exame físico detalhado com sinais vitais integrados ao texto.",
      "sinais_vitais": {
        "pa": { "sistolica": 150, "diastolica": 95, "raw": "PA 150x95mmHg" },
        "fc": { "valor": 88, "raw": "FC 88bpm" },
        "sato2": { "valor": 96, "raw": "SpO2 96%" },
        "fr": { "valor": 20, "raw": "FR 20irpm" },
        "temperatura": { "valor": 36.8, "raw": "Temp 36.8°C" }
      }
    },
    "avaliacao": {
      "title": "Avaliação (A)",
      "icon": "🧠",
      "content": "Hipóteses diagnósticas com raciocínio clínico fundamentado."
    },
    "plano": {
      "title": "Plano (P)",
      "icon": "📋",
      "content": "Conduta terapêutica, prescrições, solicitação de exames, encaminhamentos."
    }
  },
  "jsonUniversal": {
    "HDA_Tecnica": "Paciente de 67 anos, sexo masculino, com queixa de dor torácica retroesternal...",
    "Comorbidades": ["HAS", "DM2", "Dislipidemia"],
    "Alergias": ["DIPIRONA", "PENICILINA"],
    "Medicações_Atuais": ["Losartana 50mg 12/12h", "Metformina 850mg 8/8h", "AAS 100mg/dia"]
  },
  "clinicalData": {
    "cid_principal": {
      "code": "I20.0",
      "desc": "Angina instável"
    },
    "sinais_vitais": {
      "pa": { "sistolica": 150, "diastolica": 95, "raw": "PA 150x95mmHg" },
      "fc": { "valor": 88, "raw": "FC 88bpm" },
      "sato2": { "valor": 96, "raw": "SpO2 96%" },
      "fr": { "valor": 20, "raw": "FR 20irpm" },
      "temperatura": { "valor": 36.8, "raw": "Temp 36.8°C" }
    },
    "medicacoes_atuais": ["Losartana 50mg 12/12h", "Metformina 850mg 8/8h"],
    "alergias": ["DIPIRONA", "PENICILINA"],
    "comorbidades": ["HAS", "DM2", "Dislipidemia"],
    "gravidade": "Moderada"
  },
  "dialog": [
    { "speaker": "medico", "text": "Bom dia, qual a sua queixa principal?" },
    { "speaker": "paciente", "text": "Estou com uma dor forte no peito desde ontem." },
    { "speaker": "medico", "text": "Vamos verificar seus sinais vitais." }
  ],
  "metadata": {
    "processedAt": "2025-01-01T00:00:00.000Z",
    "engine": "gpt-4o",
    "whisper_used": true,
    "total_falas": 3,
    "falas_medico": 2,
    "falas_paciente": 1
  }
}

## ATENÇÃO ÀS CHAVES (case-sensitive):
- "jsonUniversal" — J minúsculo, U maiúsculo
- "HDA_Tecnica" — HDA maiúsculo, T maiúsculo, underscore
- "Comorbidades" — C maiúsculo
- "Alergias" — A maiúsculo
- "Medicações_Atuais" — M maiúsculo, ç obrigatório, A maiúsculo
- "clinicalData" — c minúsculo, D maiúsculo
- "cid_principal" — tudo minúsculo com underscore
- "dialog" — tudo minúsculo, é um array de objetos

## NOTAS:
- Para sinais vitais não mencionados, use null para o objeto inteiro (ex: "pa": null).
- "gravidade" deve ser exatamente: "Leve", "Moderada" ou "Grave".
- O campo "content" de cada seção SOAP deve ser texto narrativo rico e profissional.
- Recrie a conversa em "dialog" identificando quem fala (medico/paciente) pela transcrição.
- Preencha "total_falas", "falas_medico", "falas_paciente" em metadata com a contagem real.
"""


# ══════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Healthcheck endpoint"""
    return {
        "status": "healthy",
        "service": "EIXO Medical Scribe",
        "version": "2.0",
        "timestamp": datetime.now().isoformat(),
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
    }


@app.post("/scribe/process")
async def process_with_audio(
    audio_file: UploadFile = File(...),
    context: str = Form(default=""),
    cenario: str = Form(default=""),
    idade: str = Form(default=""),
):
    """
    Main endpoint: Audio transcription (Whisper) + Clinical structuring (GPT-4o)
    Accepts multipart/form-data with audio file and metadata
    """
    try:
        logger.info(f"Processing audio: {audio_file.filename} ({audio_file.content_type})")

        # 1. Transcription via Whisper
        audio_data = await audio_file.read()

        if len(audio_data) < 100:
            raise HTTPException(status_code=400, detail="Arquivo de áudio muito pequeno ou vazio")

        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=(audio_file.filename or "audio.webm", audio_data),
            language="pt",
            response_format="text",
        )

        logger.info(f"Whisper transcription: {len(transcript)} chars")

        # 2. Clinical structuring via GPT-4o
        user_message = _build_user_prompt(transcript, context, cenario, idade)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=4000,
        )

        result = json.loads(response.choices[0].message.content)

        # Inject metadata
        result["metadata"] = {
            "processedAt": datetime.now().isoformat(),
            "engine": "gpt-4o",
            "whisper_used": True,
            "transcript_length": len(transcript),
            "audio_size_kb": int(len(audio_data) / 1024 * 10) / 10,
        }
        result["success"] = True

        logger.info(f"GPT-4o structured response: CID={result.get('clinicalData', {}).get('cid_principal', {}).get('code', '?')}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from GPT-4o: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao interpretar resposta do GPT-4o: {str(e)}")
    except Exception as e:
        logger.error(f"Process error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scribe/text")
async def process_text_only(
    texto_transcrito: str = Form(...),
    context: str = Form(default=""),
    cenario: str = Form(default=""),
    idade: str = Form(default=""),
):
    """
    Text-only endpoint: Clinical structuring (GPT-4o) without audio
    For manual text input or when SpeechRecognition already produced transcript
    """
    try:
        logger.info(f"Processing text: {len(texto_transcrito)} chars")

        if len(texto_transcrito.strip()) < 10:
            raise HTTPException(status_code=400, detail="Texto muito curto para processamento clínico")

        user_message = _build_user_prompt(texto_transcrito, context, cenario, idade)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=4000,
        )

        result = json.loads(response.choices[0].message.content)

        result["metadata"] = {
            "processedAt": datetime.now().isoformat(),
            "engine": "gpt-4o",
            "whisper_used": False,
            "transcript_length": len(texto_transcrito),
        }
        result["success"] = True

        logger.info(f"GPT-4o text response: CID={result.get('clinicalData', {}).get('cid_principal', {}).get('code', '?')}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from GPT-4o: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao interpretar resposta do GPT-4o: {str(e)}")
    except Exception as e:
        logger.error(f"Text process error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sync/receive")
async def receive_sync(data: dict):
    """
    Sync endpoint: Receives records from MedScribeDB sync queue
    In production, persist to cloud database (Firestore, PostgreSQL, etc.)
    """
    try:
        logger.info(f"Sync received: store={data.get('storeName')}, id={data.get('syncId')}")
        # TODO: Persist to cloud database
        # For now, just acknowledge receipt
        return {
            "status": "received",
            "syncId": data.get("syncId"),
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def _build_user_prompt(transcript: str, context: str = "", cenario: str = "", idade: str = "") -> str:
    """Build the user prompt with all available context"""
    parts = []

    if cenario:
        parts.append(f"Cenário de Atendimento: {cenario}")
    if idade:
        parts.append(f"Idade do Paciente: {idade} anos")
    if context:
        parts.append(f"Contexto adicional: {context}")

    parts.append(f"\nTranscrição da consulta:\n\"\"\"\n{transcript}\n\"\"\"")

    return "\n".join(parts)


# ── Run ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
