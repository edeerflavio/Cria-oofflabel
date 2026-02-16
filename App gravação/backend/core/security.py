"""
core/security.py — LGPD Compliance Module
Medical Scribe Enterprise v3.0
Direct translation of lgpd.js
Sanitizes patient names to initials, generates anonymous IDs
"""

import time


def sanitize_name(nome_completo: str) -> str:
    """
    Transforms full name into uppercase initials.
    "João Oliveira Silva" → "J.O.S."
    Direct translation of lgpd.js sanitizeName()
    """
    if not nome_completo or not isinstance(nome_completo, str):
        return "N.N."

    parts = nome_completo.strip().split()
    parts = [p for p in parts if len(p) > 0]

    if len(parts) == 0:
        return "N.N."

    initials = ".".join(p[0].upper() for p in parts)
    return initials + "."


def generate_anon_id(nome_completo: str, idade: int) -> str:
    """
    Generates anonymous patient ID (hash-based).
    Same algorithm as lgpd.js generateAnonId()
    Uses JS-compatible shift-5-minus-hash.
    """
    raw = f"{nome_completo}-{idade}-{int(time.time() * 1000)}"
    hash_val = 0

    for char in raw:
        code = ord(char)
        hash_val = ((hash_val << 5) - hash_val) + code
        # Simulate JS 32-bit integer overflow (|= 0)
        hash_val = hash_val & 0xFFFFFFFF
        if hash_val >= 0x80000000:
            hash_val -= 0x100000000

    # Convert to base36 uppercase, pad to 8 chars
    base36 = _to_base36(abs(hash_val)).upper().zfill(8)
    return f"PAC-{base36}"


def _to_base36(number: int) -> str:
    """Convert integer to base36 string (same as JS Number.toString(36))."""
    if number == 0:
        return "0"
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while number > 0:
        result = chars[number % 36] + result
        number //= 36
    return result


def process_patient_input(raw_input: dict) -> dict:
    """
    Processes raw patient input with LGPD compliance.
    Returns sanitized object; original name is NEVER stored.
    Direct translation of lgpd.js processPatientInput()
    """
    nome_completo = raw_input.get("nome_completo", "")
    idade = raw_input.get("idade")
    cenario_atendimento = raw_input.get("cenario_atendimento", "")
    texto_transcrito = raw_input.get("texto_transcrito", "")

    # Validate required fields
    errors = []
    if not nome_completo or len(nome_completo.strip()) < 2:
        errors.append("Nome completo é obrigatório")

    try:
        idade_int = int(idade) if idade is not None else -1
    except (ValueError, TypeError):
        idade_int = -1

    if idade_int < 0 or idade_int > 150:
        errors.append("Idade válida é obrigatória")

    if not cenario_atendimento:
        errors.append("Cenário de atendimento é obrigatório")

    if errors:
        return {"success": False, "errors": errors}

    # Build sanitized output — original name is NEVER kept
    from datetime import datetime

    sanitized = {
        "iniciais": sanitize_name(nome_completo),
        "paciente_id": generate_anon_id(nome_completo, idade_int),
        "idade": idade_int,
        "cenario_atendimento": cenario_atendimento,
        "texto_transcrito": texto_transcrito,
        "timestamp": datetime.now().isoformat(),
        "lgpd_conformidade": True,
    }

    # Safety: nome_completo only exists in this function scope
    return {"success": True, "data": sanitized}
