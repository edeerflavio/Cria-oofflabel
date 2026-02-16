"""
models/schemas.py — Pydantic Models
Medical Scribe Enterprise v3.0
Mirrors exact JSON contract from JS MVP (soap-engine.js, app.js)
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ══════════════════════════════════════
# Vital Signs (same nested structure as JS)
# ══════════════════════════════════════

class PressaoArterial(BaseModel):
    sistolica: int
    diastolica: int
    raw: str


class SinalVitalSimples(BaseModel):
    valor: float
    raw: str


class SinaisVitais(BaseModel):
    pa: Optional[PressaoArterial] = None
    fc: Optional[SinalVitalSimples] = None
    temperatura: Optional[SinalVitalSimples] = None
    sato2: Optional[SinalVitalSimples] = None
    fr: Optional[SinalVitalSimples] = None


# ══════════════════════════════════════
# CID
# ══════════════════════════════════════

class CidPrincipal(BaseModel):
    code: str
    desc: str


# ══════════════════════════════════════
# Clinical Data
# ══════════════════════════════════════

class ClinicalData(BaseModel):
    cid_principal: CidPrincipal
    sinais_vitais: SinaisVitais
    medicacoes_atuais: list[str] = []
    alergias: list[str] = []
    comorbidades: list[str] = []
    gravidade: str = "Leve"  # "Leve" | "Moderada" | "Grave"


# ══════════════════════════════════════
# SOAP Sections
# ══════════════════════════════════════

class SOAPSubjetivo(BaseModel):
    title: str = "Subjetivo (S)"
    icon: str = "💬"
    content: str
    queixa_principal: str = "Não identificada"
    hda: str = ""


class SOAPObjetivo(BaseModel):
    title: str = "Objetivo (O)"
    icon: str = "🔍"
    content: str
    sinais_vitais: SinaisVitais
    exame_fisico: str = "A completar."


class SOAPAvaliacao(BaseModel):
    title: str = "Avaliação (A)"
    icon: str = "🧠"
    content: str
    hipotese_diagnostica: str = ""
    cid10: str = ""
    diagnosticos_diferenciais: str = "A considerar conforme evolução clínica."


class SOAPPlano(BaseModel):
    title: str = "Plano (P)"
    icon: str = "📋"
    content: str
    prescricoes: list[str] = []
    exames_solicitados: list[str] = []
    orientacoes: str = "Retorno conforme agendamento."
    encaminhamentos: list[str] = []


class SOAPResult(BaseModel):
    subjetivo: SOAPSubjetivo
    objetivo: SOAPObjetivo
    avaliacao: SOAPAvaliacao
    plano: SOAPPlano


# ══════════════════════════════════════
# JSON Universal (exact casing from JS MVP)
# ══════════════════════════════════════

class JsonUniversal(BaseModel):
    HDA_Tecnica: str = ""
    Comorbidades: list[str] = []
    Alergias: list[str] = []
    Medicacoes_Atuais: list[str] = Field(default=[], alias="Medicações_Atuais")

    model_config = {"populate_by_name": True}


# ══════════════════════════════════════
# Dialog / Diarization
# ══════════════════════════════════════

class DialogEntry(BaseModel):
    speaker: str  # "medico" | "paciente" | "indefinido"
    text: str


# ══════════════════════════════════════
# Metadata
# ══════════════════════════════════════

class ProcessingMetadata(BaseModel):
    total_falas: int = 0
    falas_medico: int = 0
    falas_paciente: int = 0
    processado_em: str = ""


# ══════════════════════════════════════
# Request / Response
# ══════════════════════════════════════

class AnalyzeRequest(BaseModel):
    nome_completo: str
    idade: int
    cenario_atendimento: str
    texto_transcrito: str


class AnalyzeResponse(BaseModel):
    success: bool = True
    soap: SOAPResult
    clinicalData: ClinicalData
    jsonUniversal: JsonUniversal
    dialog: list[DialogEntry] = []
    metadata: ProcessingMetadata
    patient: Optional[dict] = None
    documents: Optional[dict] = None


# ══════════════════════════════════════
# Document Models
# ══════════════════════════════════════

class PrescriptionItem(BaseModel):
    med: str
    dose: str
    via: str
    freq: str
    duracao: str
    obs: str = ""


class DocumentResult(BaseModel):
    title: str
    type: str
    content: str
    validated: bool = False
    timestamp: str = ""
