"""
app/database.py — Async PostgreSQL Database Layer
Medical Scribe Enterprise v3.0
SQLAlchemy 2.0 Async + asyncpg
"""

import os
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Float, Text, DateTime, JSON, Boolean


# ══════════════════════════════════════════════════════════════
# Engine & Session
# ══════════════════════════════════════════════════════════════

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://admin:senha123@localhost:5432/medical_scribe"
)

engine = create_async_engine(DATABASE_URL, echo=True)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables (call once on startup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ══════════════════════════════════════════════════════════════
# ORM Models
# ══════════════════════════════════════════════════════════════

class ConsultationRecord(Base):
    """
    Persists each consultation cycle.
    Maps to the same data contract as bi-module.js recordCycle().
    """
    __tablename__ = "consultations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Patient (LGPD-safe — only initials, never real name) ──
    iniciais: Mapped[str] = mapped_column(String(20), nullable=False)
    paciente_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    idade: Mapped[int] = mapped_column(Integer, nullable=False)
    cenario_atendimento: Mapped[str] = mapped_column(String(30), nullable=False)

    # ── Clinical ──
    cid_principal_code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    cid_principal_desc: Mapped[str] = mapped_column(String(200), nullable=False)
    gravidade: Mapped[str] = mapped_column(String(20), nullable=False)  # Leve | Moderada | Grave

    # ── Vital Signs (stored as JSON for flexibility) ──
    sinais_vitais: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ── SOAP (full structured output) ──
    soap_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    json_universal: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    clinical_data_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ── Dialog / Diarization ──
    dialog_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    total_falas: Mapped[int] = mapped_column(Integer, default=0)
    falas_medico: Mapped[int] = mapped_column(Integer, default=0)
    falas_paciente: Mapped[int] = mapped_column(Integer, default=0)

    # ── Documents ──
    documents_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ── Metadata ──
    texto_transcrito: Mapped[str | None] = mapped_column(Text, nullable=True)
    lgpd_conformidade: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BIRecord(Base):
    """
    Lightweight BI aggregation record.
    Same structure as bi-module.js recordCycle() output.
    """
    __tablename__ = "bi_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    iniciais: Mapped[str] = mapped_column(String(20), nullable=False)
    cenario: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    cid_principal: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    cid_desc: Mapped[str] = mapped_column(String(200), nullable=False)
    gravidade_estimada: Mapped[str] = mapped_column(String(20), nullable=False)
    sinais_vitais: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    hora: Mapped[int] = mapped_column(Integer, nullable=True)
    dia_semana: Mapped[str] = mapped_column(String(20), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentRecord(Base):
    """
    Persists generated clinical documents.
    Maps to documents.js generateAll() output.
    """
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    consultation_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False)  # prescription | attestation | exam_request | patient_guide
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    validated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
