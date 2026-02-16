"""
services/soap_engine.py — SOAP Processing Engine
Medical Scribe Enterprise v3.0
Direct translation of soap-engine.js
CID_DATABASE, extractVitalSigns, diarize, extractClinicalData, buildSOAP, process
"""

import re
from datetime import datetime


# ══════════════════════════════════════════════════════════════
# CID-10 DATABASE (same ~95 entries from soap-engine.js)
# ══════════════════════════════════════════════════════════════

CID_DATABASE: dict[str, dict[str, str]] = {
    # ── Emergência: Sepse ──
    "sepse grave": {"code": "A41.9", "desc": "Sepse grave"},
    "choque séptico": {"code": "R65.1", "desc": "Choque séptico"},
    "sirs": {"code": "R65.1", "desc": "Síndrome da resposta inflamatória sistêmica"},
    "bacteremia": {"code": "A49.9", "desc": "Bacteremia"},
    "sepse": {"code": "A41", "desc": "Septicemia"},

    # ── Emergência: IAM / SCA ──
    "iamcsst": {"code": "I21.0", "desc": "IAM com supra de ST (IAMCSST)"},
    "iamssst": {"code": "I21.4", "desc": "IAM sem supra de ST (IAMSSST)"},
    "síndrome coronariana aguda": {"code": "I24.9", "desc": "Síndrome coronariana aguda"},
    "síndrome coronariana": {"code": "I24.9", "desc": "Síndrome coronariana aguda"},
    "angina instável": {"code": "I20.0", "desc": "Angina instável"},
    "iam": {"code": "I21", "desc": "Infarto agudo do miocárdio"},
    "infarto": {"code": "I21", "desc": "Infarto agudo do miocárdio"},

    # ── Emergência: AVC ──
    "avc isquêmico": {"code": "I63", "desc": "AVC isquêmico"},
    "avc hemorrágico": {"code": "I61", "desc": "AVC hemorrágico"},
    "ataque isquêmico transitório": {"code": "G45", "desc": "Ataque isquêmico transitório (AIT)"},
    "ait": {"code": "G45", "desc": "Ataque isquêmico transitório (AIT)"},
    "avc": {"code": "I64", "desc": "Acidente vascular cerebral"},
    "derrame": {"code": "I64", "desc": "Acidente vascular cerebral"},

    # ── Emergência: Choque ──
    "choque hipovolêmico": {"code": "R57.1", "desc": "Choque hipovolêmico"},
    "choque cardiogênico": {"code": "R57.0", "desc": "Choque cardiogênico"},
    "choque anafilático": {"code": "T78.2", "desc": "Choque anafilático"},
    "choque distributivo": {"code": "R57.8", "desc": "Choque distributivo"},

    # ── Terapia Intensiva (UTI) ──
    "sdra": {"code": "J80", "desc": "Síndrome do desconforto respiratório agudo"},
    "insuficiência respiratória aguda": {"code": "J96.0", "desc": "Insuficiência respiratória aguda"},
    "insuficiência respiratória": {"code": "J96", "desc": "Insuficiência respiratória"},
    "parada cardiorrespiratória": {"code": "I46", "desc": "Parada cardiorrespiratória"},
    "pcr": {"code": "I46", "desc": "Parada cardiorrespiratória"},
    "ventilação mecânica": {"code": "Z99.1", "desc": "Dependência de ventilação mecânica"},
    "rabdomiólise": {"code": "M62.8", "desc": "Rabdomiólise"},
    "civd": {"code": "D65", "desc": "Coagulação intravascular disseminada"},
    "politrauma": {"code": "T07", "desc": "Politraumatismo"},
    "edema cerebral": {"code": "G93.6", "desc": "Edema cerebral"},
    "status epilepticus": {"code": "G41", "desc": "Estado de mal epiléptico"},
    "cetoacidose diabética": {"code": "E10.1", "desc": "Cetoacidose diabética"},
    "crise hipertensiva": {"code": "I16", "desc": "Crise hipertensiva"},
    "tamponamento cardíaco": {"code": "I31.4", "desc": "Tamponamento cardíaco"},
    "tromboembolismo pulmonar": {"code": "I26", "desc": "Tromboembolismo pulmonar"},
    "tep": {"code": "I26", "desc": "Tromboembolismo pulmonar"},

    # ── Condições comuns ──
    "hipertensão": {"code": "I10", "desc": "Hipertensão essencial (primária)"},
    "pressão alta": {"code": "I10", "desc": "Hipertensão essencial (primária)"},
    "diabetes tipo 2": {"code": "E11", "desc": "Diabetes mellitus tipo 2"},
    "diabetes tipo 1": {"code": "E10", "desc": "Diabetes mellitus tipo 1"},
    "diabetes": {"code": "E11", "desc": "Diabetes mellitus tipo 2"},
    "asma": {"code": "J45", "desc": "Asma"},
    "pneumonia": {"code": "J18", "desc": "Pneumonia"},
    "covid": {"code": "U07.1", "desc": "COVID-19"},
    "gripe": {"code": "J11", "desc": "Influenza"},
    "infecção urinária": {"code": "N39.0", "desc": "Infecção do trato urinário"},
    "itu": {"code": "N39.0", "desc": "Infecção do trato urinário"},
    "cefaleia": {"code": "R51", "desc": "Cefaleia"},
    "dor de cabeça": {"code": "R51", "desc": "Cefaleia"},
    "enxaqueca": {"code": "G43", "desc": "Enxaqueca"},
    "lombalgia": {"code": "M54.5", "desc": "Lombalgia"},
    "dor lombar": {"code": "M54.5", "desc": "Lombalgia"},
    "dor nas costas": {"code": "M54.5", "desc": "Lombalgia"},
    "gastrite": {"code": "K29", "desc": "Gastrite"},
    "dor abdominal": {"code": "R10", "desc": "Dor abdominal"},
    "dor no peito": {"code": "R07", "desc": "Dor torácica"},
    "dor torácica": {"code": "R07", "desc": "Dor torácica"},
    "febre": {"code": "R50", "desc": "Febre de origem desconhecida"},
    "tosse": {"code": "R05", "desc": "Tosse"},
    "dispneia": {"code": "R06.0", "desc": "Dispneia"},
    "falta de ar": {"code": "R06.0", "desc": "Dispneia"},
    "ansiedade": {"code": "F41", "desc": "Transtornos ansiosos"},
    "depressão": {"code": "F32", "desc": "Episódio depressivo"},
    "insônia": {"code": "G47.0", "desc": "Insônia"},
    "alergia": {"code": "T78.4", "desc": "Alergia não especificada"},
    "rinite": {"code": "J30", "desc": "Rinite alérgica"},
    "sinusite": {"code": "J32", "desc": "Sinusite crônica"},
    "otite": {"code": "H66", "desc": "Otite média"},
    "dor de ouvido": {"code": "H66", "desc": "Otite média"},
    "faringite": {"code": "J02", "desc": "Faringite aguda"},
    "dor de garganta": {"code": "J02", "desc": "Faringite aguda"},
    "dengue": {"code": "A90", "desc": "Dengue"},
    "diarreia": {"code": "A09", "desc": "Diarreia e gastroenterite"},
    "vômito": {"code": "R11", "desc": "Náusea e vômitos"},
    "fratura": {"code": "T14.2", "desc": "Fratura de região do corpo não especificada"},
    "entorse": {"code": "T14.3", "desc": "Luxação, entorse de região não especificada"},
    "icc": {"code": "I50", "desc": "Insuficiência cardíaca"},
    "insuficiência cardíaca": {"code": "I50", "desc": "Insuficiência cardíaca"},
    "dpoc": {"code": "J44", "desc": "Doença pulmonar obstrutiva crônica"},
    "insuficiência renal": {"code": "N18", "desc": "Doença renal crônica"},
    "irc": {"code": "N18", "desc": "Doença renal crônica"},
}


# ══════════════════════════════════════════════════════════════
# MEDICATION PATTERNS (same 33 entries from JS)
# ══════════════════════════════════════════════════════════════

MED_PATTERNS: list[str] = [
    "dipirona", "paracetamol", "ibuprofeno", "amoxicilina", "azitromicina",
    "losartana", "metformina", "omeprazol", "enalapril", "atenolol",
    "hidroclorotiazida", "sinvastatina", "captopril", "anlodipino",
    "fluoxetina", "sertralina", "clonazepam", "diazepam", "prednisona",
    "dexametasona", "cetoprofeno", "nimesulida", "ciprofloxacino",
    "cefalexina", "metronidazol", "ranitidina", "insulina", "aspirina",
    "clopidogrel", "enoxaparina", "furosemida", "espironolactona",
    "salbutamol", "budesonida", "loratadina", "prometazina",
]

# Allergy keywords (same 5 from JS)
ALLERGY_KEYWORDS: list[str] = ["alergia", "alérgico", "alérgica", "alergias", "intolerância"]


# ══════════════════════════════════════════════════════════════
# FUNCTIONS — direct translation from soap-engine.js
# ══════════════════════════════════════════════════════════════

def extract_vital_signs(text: str) -> dict:
    """
    Extract vital signs from text using regex patterns.
    Direct translation of extractVitalSigns() from soap-engine.js.
    Same 5 regex patterns: PA, FC, Temp, SatO2, FR.
    """
    sinais: dict = {"pa": None, "fc": None, "temperatura": None, "sato2": None, "fr": None}

    # PA: "PA 120x80", "PA 120/80", "pressão 12 por 8", "PA:120x80"
    pa_match = re.search(
        r"(?:pa|pressão\s*arterial)[:\s]+?(\d{2,3})\s*[x/]\s*(\d{2,3})", text, re.IGNORECASE
    ) or re.search(
        r"pressão\s+(\d{2,3})\s*(?:por|x|/)\s*(\d{2,3})", text, re.IGNORECASE
    )
    if pa_match:
        sinais["pa"] = {
            "sistolica": int(pa_match.group(1)),
            "diastolica": int(pa_match.group(2)),
            "raw": pa_match.group(0).strip(),
        }

    # FC: "FC 88", "frequência cardíaca 88", "pulso 88", "FC:88bpm"
    fc_match = re.search(
        r"(?:fc|frequência\s*cardíaca|pulso)[:\s]+?(\d{2,3})\s*(?:bpm)?", text, re.IGNORECASE
    )
    if fc_match:
        sinais["fc"] = {"valor": int(fc_match.group(1)), "raw": fc_match.group(0).strip()}

    # Temperatura: "temperatura 37.5", "temp 38", "T 37.8°C", "Tax 38.2"
    temp_match = re.search(
        r"(?:temperatura|temp|tax)[:\s]+?(\d{2}[.,]?\d?)\s*°?\s*c?", text, re.IGNORECASE
    )
    if temp_match:
        valor = float(temp_match.group(1).replace(",", "."))
        sinais["temperatura"] = {"valor": valor, "raw": temp_match.group(0).strip()}

    # SatO2: "sat 96", "spo2 98", "saturação 94%", "SpO2:92%"
    sat_match = re.search(
        r"(?:sat(?:ura[çc][aã]o)?|spo2|sato2)[:\s]+?(\d{2,3})\s*%?", text, re.IGNORECASE
    )
    if sat_match:
        sinais["sato2"] = {"valor": int(sat_match.group(1)), "raw": sat_match.group(0).strip()}

    # FR: "FR 18", "frequência respiratória 20", "FR:24irpm"
    fr_match = re.search(
        r"(?:fr|frequência\s*respiratória)[:\s]+?(\d{1,2})\s*(?:irpm|rpm)?", text, re.IGNORECASE
    )
    if fr_match:
        sinais["fr"] = {"valor": int(fr_match.group(1)), "raw": fr_match.group(0).strip()}

    return sinais


def diarize(raw_text: str) -> list[dict]:
    """
    Simulated Diarization: separates Doctor vs Patient speech.
    Direct translation of diarize() from soap-engine.js.
    Same 8 doctor + 8 patient regex patterns.
    """
    lines = [line.strip() for line in re.split(r"[.\n]+", raw_text) if len(line.strip()) > 5]
    dialog = []

    # Patterns that suggest doctor speech (same 8 from JS)
    doctor_patterns = [
        re.compile(r"^(doutor|dra?\.?|médico)", re.IGNORECASE),
        re.compile(r"vamos (examinar|verificar|avaliar|prescrever)", re.IGNORECASE),
        re.compile(r"minha (hipótese|avaliação|conduta)", re.IGNORECASE),
        re.compile(r"(prescrevo|solicito|recomendo|indico|oriento)", re.IGNORECASE),
        re.compile(r"(exame físico|ausculta|palpação|inspeção)", re.IGNORECASE),
        re.compile(r"(pa |fc |fr |spo2|sat |temperatura|sinais vitais)", re.IGNORECASE),
        re.compile(r"(diagnóstico|prognóstico|conduta|plano)", re.IGNORECASE),
        re.compile(r"^(vou |preciso |solicitar|pedir)", re.IGNORECASE),
    ]

    # Patterns that suggest patient speech (same 8 from JS)
    patient_patterns = [
        re.compile(r"^(paciente|pac\.?)", re.IGNORECASE),
        re.compile(r"(estou sentindo|sinto|tenho sentido|comecei)", re.IGNORECASE),
        re.compile(r"(dói|doendo|doer|incômodo)", re.IGNORECASE),
        re.compile(r"(faz .+ dias|há .+ dias|desde)", re.IGNORECASE),
        re.compile(r"(meu|minha) (dor|febre|tosse|mal[\s-]?estar)", re.IGNORECASE),
        re.compile(r"(tomo|uso|tomando|usando) .+(mg|ml|comprimido)", re.IGNORECASE),
        re.compile(r"(me sinto|sinto[\s-]?me|estou)", re.IGNORECASE),
        re.compile(r"(queixa|queixo|reclamo)", re.IGNORECASE),
    ]

    for line in lines:
        doc_score = sum(1 for p in doctor_patterns if p.search(line))
        pat_score = sum(1 for p in patient_patterns if p.search(line))

        if doc_score > pat_score:
            speaker = "medico"
        elif pat_score > doc_score:
            speaker = "paciente"
        else:
            speaker = "paciente" if len(line) > 60 else "medico"

        dialog.append({"speaker": speaker, "text": line})

    return dialog


def extract_clinical_data(text: str) -> dict:
    """
    Extract clinical data from text.
    Direct translation of extractClinicalData() from soap-engine.js.
    """
    lower = text.lower()

    # Extract CID
    cid_principal = None
    for keyword, cid_info in CID_DATABASE.items():
        if keyword in lower:
            cid_principal = cid_info
            break

    # Extract vital signs
    sinais_vitais = extract_vital_signs(text)

    # Extract medications
    medicacoes = []
    for med in MED_PATTERNS:
        if med in lower:
            medicacoes.append(med[0].upper() + med[1:])

    # Extract allergies (CAIXA ALTA per requirement)
    alergias = []
    for keyword in ALLERGY_KEYWORDS:
        idx = lower.find(keyword)
        if idx != -1:
            surrounding = text[max(0, idx - 5):min(len(text), idx + 60)]
            match = re.search(
                r"(?:alergia|alérgic[oa]|alergias|intolerância)\s+(?:a\s+|ao?\s+)?([^,.\n]+)",
                surrounding,
                re.IGNORECASE,
            )
            if match:
                alergias.append(match.group(1).strip().upper())

    if not alergias:
        alergias.append("NADA (NEGA ALERGIAS CONHECIDAS - NKDA)")

    # Extract comorbidities
    comorbidades = []
    comorb_patterns = [
        "hipertensão", "diabetes", "asma", "dpoc", "icc", "insuficiência renal",
        "insuficiência cardíaca", "hiv", "hepatite", "obesidade", "dislipidemia",
        "hipotireoidismo", "hipertireoidismo", "epilepsia", "arritmia",
    ]
    for comorb in comorb_patterns:
        if comorb in lower:
            comorbidades.append(comorb[0].upper() + comorb[1:])

    # Estimate severity (same keywords as JS)
    gravidade = "Leve"
    severe_keywords = [
        "iam", "infarto", "avc", "derrame", "sepse", "pcr", "choque",
        "rebaixamento", "coma", "hemorragia", "politrauma", "sdra", "civd",
        "choque séptico", "choque cardiogênico", "tamponamento", "tep",
        "parada cardiorrespiratória", "status epilepticus", "cetoacidose",
    ]
    moderate_keywords = [
        "febre alta", "dispneia", "falta de ar", "taquicardia",
        "hipotensão", "desidratação", "pneumonia", "fratura",
        "crise hipertensiva", "angina instável", "insuficiência respiratória",
        "rabdomiólise", "edema cerebral",
    ]

    if any(k in lower for k in severe_keywords):
        gravidade = "Grave"
    elif any(k in lower for k in moderate_keywords):
        gravidade = "Moderada"

    return {
        "cid_principal": cid_principal or {"code": "R69", "desc": "Causa de morbidade desconhecida"},
        "sinais_vitais": sinais_vitais,
        "medicacoes_atuais": medicacoes,
        "alergias": alergias,
        "comorbidades": comorbidades,
        "gravidade": gravidade,
    }


def build_soap(dialog: list[dict], clinical_data: dict) -> dict:
    """
    Build SOAP structure from diarized dialog.
    Direct translation of buildSOAP() from soap-engine.js.
    """
    patient_lines = [d["text"] for d in dialog if d["speaker"] == "paciente"]
    doctor_lines = [d["text"] for d in dialog if d["speaker"] == "medico"]
    sv = clinical_data["sinais_vitais"]

    # Build Objetivo content
    vitals_parts = []
    if sv.get("pa"):
        vitals_parts.append(f"PA {sv['pa']['sistolica']}x{sv['pa']['diastolica']}mmHg")
    if sv.get("fc"):
        vitals_parts.append(f"FC {sv['fc']['valor']}bpm")
    if sv.get("fr"):
        vitals_parts.append(f"FR {sv['fr']['valor']}irpm")
    if sv.get("sato2"):
        vitals_parts.append(f"SpO2 {sv['sato2']['valor']}%")
    if sv.get("temperatura"):
        vitals_parts.append(f"Temp {sv['temperatura']['valor']}°C")

    vitals_str = f"Sinais vitais: {', '.join(vitals_parts)}. " if vitals_parts else ""
    exam_lines = [l for l in doctor_lines if re.search(r"exame|ausculta|palpação|inspeção|vital", l, re.IGNORECASE)]
    exam_str = ". ".join(exam_lines) if exam_lines else "Exame físico registrado durante consulta."

    cid = clinical_data["cid_principal"]

    return {
        "subjetivo": {
            "title": "Subjetivo (S)",
            "icon": "💬",
            "content": ". ".join(patient_lines) + "." if patient_lines else "Paciente refere queixa principal conforme transcrição.",
            "queixa_principal": patient_lines[0] if patient_lines else "Não identificada",
            "hda": ". ".join(patient_lines[1:]) if len(patient_lines) > 1 else "Detalhes na transcrição completa.",
        },
        "objetivo": {
            "title": "Objetivo (O)",
            "icon": "🔍",
            "content": vitals_str + exam_str,
            "sinais_vitais": sv,
            "exame_fisico": ". ".join(exam_lines) if exam_lines else "A completar.",
        },
        "avaliacao": {
            "title": "Avaliação (A)",
            "icon": "🧠",
            "content": f"Hipótese diagnóstica: {cid['desc']} ({cid['code']})",
            "hipotese_diagnostica": cid["desc"],
            "cid10": cid["code"],
            "diagnosticos_diferenciais": "A considerar conforme evolução clínica.",
        },
        "plano": {
            "title": "Plano (P)",
            "icon": "📋",
            "content": ". ".join(
                l for l in doctor_lines
                if re.search(r"prescrevo|solicito|recomendo|indico|oriento|conduta|plano", l, re.IGNORECASE)
            ) or "Conduta a ser definida pelo médico assistente.",
            "prescricoes": clinical_data["medicacoes_atuais"],
            "exames_solicitados": [],
            "orientacoes": "Retorno conforme agendamento.",
            "encaminhamentos": [],
        },
    }


def process(raw_text: str) -> dict:
    """
    Main processing function.
    Direct translation of process() from soap-engine.js.
    Returns complete SOAP + clinical data + jsonUniversal.
    """
    if not raw_text or len(raw_text.strip()) < 10:
        return {
            "success": False,
            "error": "Texto insuficiente para processamento. Mínimo de 10 caracteres.",
        }

    dialog = diarize(raw_text)
    clinical_data = extract_clinical_data(raw_text)
    soap = build_soap(dialog, clinical_data)

    json_universal = {
        "HDA_Tecnica": soap["subjetivo"]["hda"],
        "Comorbidades": clinical_data["comorbidades"],
        "Alergias": clinical_data["alergias"],  # Already in CAIXA ALTA
        "Medicações_Atuais": clinical_data["medicacoes_atuais"],
    }

    return {
        "success": True,
        "dialog": dialog,
        "soap": soap,
        "clinicalData": clinical_data,
        "jsonUniversal": json_universal,
        "metadata": {
            "total_falas": len(dialog),
            "falas_medico": sum(1 for d in dialog if d["speaker"] == "medico"),
            "falas_paciente": sum(1 for d in dialog if d["speaker"] == "paciente"),
            "processado_em": datetime.now().isoformat(),
        },
    }
