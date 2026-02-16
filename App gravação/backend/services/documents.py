"""
services/documents.py — Clinical Document Generator
Medical Scribe Enterprise v3.0
Direct translation of documents.js
EXAM_MAP, PRESCRIPTION_MAP, ALERT_MAP, generate_all()
"""

from datetime import datetime


# ══════════════════════════════════════════════════════════════
# LOOKUP TABLES (same from documents.js)
# ══════════════════════════════════════════════════════════════

EXAM_MAP: dict[str, list[str]] = {
    "I": ["ECG", "Ecocardiograma", "RX Tórax", "Hemograma completo", "Troponina", "BNP", "Perfil lipídico"],
    "E": ["Glicemia de jejum", "HbA1c", "Perfil lipídico", "Creatinina", "Microalbuminúria"],
    "J": ["RX Tórax", "Hemograma", "PCR", "Gasometria", "Cultura de escarro"],
    "R": ["Hemograma", "PCR", "VHS", "Eletrólitos", "Função renal"],
    "N": ["EAS", "Urocultura", "Creatinina", "Ureia"],
    "G": ["TC de crânio", "Hemograma", "Glicemia", "Eletrólitos"],
    "M": ["RX região afetada", "Hemograma", "PCR", "VHS", "Ácido úrico"],
    "K": ["Endoscopia digestiva alta", "Hemograma", "Função hepática"],
    "F": ["TSH", "T4L", "Hemograma", "Glicemia"],
    "A": ["Hemograma", "Hemoculturas", "Lactato", "Procalcitonina", "PCR"],
    "H": ["Otoscopia", "Audiometria"],
    "T": ["RX região afetada", "Hemograma", "Coagulograma"],
    "U": ["PCR (COVID)", "Hemograma", "PCR", "D-dímero", "Ferritina", "DHL"],
}

PRESCRIPTION_MAP: dict[str, list[dict]] = {
    "R51": [
        {"med": "Dipirona 500mg", "dose": "1 comprimido", "via": "VO", "freq": "6/6h", "duracao": "3 dias", "obs": "se dor"},
        {"med": "Paracetamol 750mg", "dose": "1 comprimido", "via": "VO", "freq": "8/8h", "duracao": "3 dias", "obs": "alternativa"},
    ],
    "I10": [
        {"med": "Losartana 50mg", "dose": "1 comprimido", "via": "VO", "freq": "1x/dia", "duracao": "Uso contínuo", "obs": ""},
        {"med": "Hidroclorotiazida 25mg", "dose": "1 comprimido", "via": "VO", "freq": "1x/dia", "duracao": "Uso contínuo", "obs": "manhã"},
    ],
    "E11": [
        {"med": "Metformina 850mg", "dose": "1 comprimido", "via": "VO", "freq": "2x/dia", "duracao": "Uso contínuo", "obs": "após refeições"},
    ],
    "J45": [
        {"med": "Salbutamol spray 100mcg", "dose": "2 jatos", "via": "Inalatória", "freq": "6/6h", "duracao": "5 dias", "obs": "com espaçador se disponível"},
    ],
    "K29": [
        {"med": "Omeprazol 20mg", "dose": "1 cápsula", "via": "VO", "freq": "1x/dia", "duracao": "7 dias", "obs": "em jejum"},
    ],
}

ATTEST_DAYS: dict[str, int] = {"Leve": 1, "Moderada": 3, "Grave": 7}

ALERT_MAP: dict[str, list[str]] = {
    "I10": [
        "Dor de cabeça intensa que não melhora com medicação",
        "Visão turva ou embaçada",
        "Dor no peito ou falta de ar",
        "Sangramento nasal persistente",
    ],
    "E11": [
        "Tremores, sudorese fria ou confusão (hipoglicemia)",
        "Sede excessiva com muita urina",
        "Visão embaçada súbita",
        "Ferida que não cicatriza",
    ],
    "I21": [
        "Dor no peito irradiando para braço, mandíbula ou costas",
        "Sudorese fria e palidez",
        "Falta de ar intensa ou náuseas",
        "LIGUE 192 (SAMU) IMEDIATAMENTE se estes sintomas surgirem",
    ],
    "I64": [
        "Perda de força em um lado do corpo",
        "Fala arrastada ou dificuldade para falar",
        "Confusão mental súbita",
        "Dor de cabeça muito forte e repentina",
        "LIGUE 192 (SAMU) IMEDIATAMENTE",
    ],
    "A41": [
        "Febre que não cede com antitérmico",
        "Confusão mental ou sonolência excessiva",
        "Pele fria, pegajosa ou manchas vermelhas/roxas",
        "Falta de ar ou respiração acelerada",
        "PROCURE EMERGÊNCIA IMEDIATAMENTE",
    ],
    "R57": [
        "Extremidades frias ou pálidas",
        "Tontura intensa ao levantar",
        "Confusão mental ou desmaio",
        "Palidez acentuada ou suor frio",
        "Procure emergência IMEDIATAMENTE",
    ],
    "J44": [
        "Falta de ar progressiva, mesmo em repouso",
        "Aumento da tosse com catarro espesso",
        "Lábios ou unhas azulados",
        "Febre associada a piora da falta de ar",
    ],
    "I50": [
        "Inchaço progressivo nas pernas ou abdômen",
        "Falta de ar ao deitar (precisar dormir sentado)",
        "Ganho de peso rápido (mais de 1kg/dia)",
        "Tosse persistente, especialmente à noite",
    ],
    # Category fallbacks
    "_I": ["Dor no peito, falta de ar ou desmaio"],
    "_E": ["Tremores, sudorese fria, confusão ou sede excessiva"],
    "_J": ["Falta de ar progressiva, febre alta ou catarro com sangue"],
    "_N": ["Dor intensa nas costas/flancos, febre ou sangue na urina"],
    "_R": ["Sintomas que pioram ou não melhoram em 48h"],
    "_G": ["Dor de cabeça muito forte, convulsões ou confusão mental"],
    "_M": ["Inchaço, vermelhidão intensa ou incapacidade de movimentar"],
    "_K": ["Vômitos com sangue, dor abdominal intensa ou fezes escuras"],
    "_A": ["Febre que não cede, prostração ou confusão mental"],
    "_T": ["Inchaço progressivo, dormência ou sangramento"],
    "_DEFAULT": [
        "Febre persistente acima de 38.5°C",
        "Dor que não melhora com a medicação",
        "Falta de ar ou dificuldade para respirar",
        "Qualquer piora dos sintomas",
    ],
}


# ══════════════════════════════════════════════════════════════
# DOCUMENT GENERATORS (same logic as documents.js)
# ══════════════════════════════════════════════════════════════

def generate_prescription(soap_result: dict) -> dict:
    """Generate prescription (Receituário). Translation of documents.js generatePrescription()."""
    cid_code = soap_result.get("clinicalData", {}).get("cid_principal", {}).get("code", "R69")
    items = PRESCRIPTION_MAP.get(cid_code, PRESCRIPTION_MAP.get("R51", []))

    lines = []
    for i, item in enumerate(items, 1):
        line = f"{i}) {item['med']} — {item['dose']}, {item['via']}, {item['freq']}, por {item['duracao']}"
        if item.get("obs"):
            line += f" ({item['obs']})"
        lines.append(line)

    return {
        "title": "Receituário Médico",
        "type": "prescription",
        "content": "\n".join(lines) if lines else "Sem prescrição necessária no momento.",
        "items": items,
        "validated": False,
        "timestamp": datetime.now().isoformat(),
    }


def generate_attestation(soap_result: dict, patient_data: dict) -> dict:
    """Generate medical certificate (Atestado). Translation of documents.js generateAttestation()."""
    gravidade = soap_result.get("clinicalData", {}).get("gravidade", "Leve")
    cid = soap_result.get("clinicalData", {}).get("cid_principal", {})
    days = ATTEST_DAYS.get(gravidade, 1)

    content = (
        f"Atesto para os devidos fins que o(a) paciente {patient_data.get('iniciais', 'N.N.')}, "
        f"{patient_data.get('idade', '?')} anos, "
        f"esteve sob meus cuidados profissionais, necessitando de afastamento por {days} dia(s) "
        f"a partir desta data.\n"
        f"CID-10: {cid.get('code', 'R69')} — {cid.get('desc', 'Não especificado')}"
    )

    return {
        "title": "Atestado Médico",
        "type": "attestation",
        "content": content,
        "days": days,
        "validated": False,
        "timestamp": datetime.now().isoformat(),
    }


def generate_exam_request(soap_result: dict) -> dict:
    """Generate exam request (Pedido de Exames). Translation of documents.js generateExamRequest()."""
    cid_code = soap_result.get("clinicalData", {}).get("cid_principal", {}).get("code", "R69")
    cid_desc = soap_result.get("clinicalData", {}).get("cid_principal", {}).get("desc", "")
    category = cid_code[0] if cid_code else "R"
    exams = EXAM_MAP.get(category, EXAM_MAP.get("R", []))

    lines = [f"{i}) {exam}" for i, exam in enumerate(exams, 1)]
    header = f"Solicito a realização dos seguintes exames complementares:\nHipótese diagnóstica: {cid_desc} ({cid_code})\n"

    return {
        "title": "Solicitação de Exames",
        "type": "exam_request",
        "content": header + "\n".join(lines),
        "exams": exams,
        "validated": False,
        "timestamp": datetime.now().isoformat(),
    }


def generate_patient_guide(soap_result: dict, patient_data: dict) -> dict:
    """Generate patient guide in simple language. Translation of documents.js generatePatientGuide()."""
    cid = soap_result.get("clinicalData", {}).get("cid_principal", {})
    cid_code = cid.get("code", "R69")
    gravidade = soap_result.get("clinicalData", {}).get("gravidade", "Leve")

    # Get alerts: try specific CID, then category, then default
    alerts = ALERT_MAP.get(cid_code, [])
    if not alerts:
        category = f"_{cid_code[0]}" if cid_code else "_DEFAULT"
        alerts = ALERT_MAP.get(category, ALERT_MAP.get("_DEFAULT", []))

    alert_lines = "\n".join(f"  ⚠️ {a}" for a in alerts)

    meds = soap_result.get("clinicalData", {}).get("medicacoes_atuais", [])
    med_lines = "\n".join(f"  💊 {m}" for m in meds) if meds else "  Nenhuma medicação prescrita."

    content = (
        f"📋 GUIA DE ORIENTAÇÕES PARA O PACIENTE\n"
        f"{'='*40}\n\n"
        f"Olá! Você foi atendido(a) hoje e o diagnóstico indicou: {cid.get('desc', 'condição em investigação')}.\n"
        f"Gravidade estimada: {gravidade}\n\n"
        f"🩺 SEUS MEDICAMENTOS:\n{med_lines}\n\n"
        f"🚨 PROCURE ATENDIMENTO URGENTE SE:\n{alert_lines}\n\n"
        f"📞 Em caso de emergência, ligue 192 (SAMU) ou 193 (Bombeiros)."
    )

    return {
        "title": "Guia de Orientações ao Paciente",
        "type": "patient_guide",
        "content": content,
        "alerts": alerts,
        "validated": False,
        "timestamp": datetime.now().isoformat(),
    }


def generate_all(soap_result: dict, patient_data: dict) -> dict:
    """Generate all documents from SOAP result. Translation of documents.js generateAll()."""
    return {
        "prescription": generate_prescription(soap_result),
        "attestation": generate_attestation(soap_result, patient_data),
        "exam_request": generate_exam_request(soap_result),
        "patient_guide": generate_patient_guide(soap_result, patient_data),
    }


def validate(document: dict) -> dict:
    """Validate a document (security lock). Returns validated copy."""
    doc = document.copy()
    doc["validated"] = True
    doc["validated_at"] = datetime.now().isoformat()
    doc["validated_by"] = "Médico Assistente"
    return doc


def can_export(document: dict) -> bool:
    """Check if document can be exported."""
    return document.get("validated", False) is True
