"""
app/database.py — Async PostgreSQL Database Layer
Medical Scribe Enterprise v3.0
SQLAlchemy 2.0 Async + asyncpg
"""

import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    ForeignKey,
    JSON,
    Index,
    func
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession


# ══════════════════════════════════════════════════════════════
# Engine & Session
# ══════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════
# Engine & Session
# ══════════════════════════════════════════════════════════════

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "False").lower() in ("true", "1", "yes")

engine = create_async_engine(DATABASE_URL, echo=SQLALCHEMY_ECHO)

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

# ── Multi-Tenancy & RBAC ──

class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope: Mapped[str] = mapped_column(String(20), default="tenant")  # system | tenant


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., consultation
    action: Mapped[str] = mapped_column(String(50), nullable=False)    # e.g., read
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    permission_id: Mapped[int] = mapped_column(Integer, primary_key=True)


class TenantUserRole(Base):
    __tablename__ = "tenant_user_roles"

    tenant_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    
    # ── Identification ──
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    birth_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    mother_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # ── Sensitive Data ──
    # Stored plain but MUST be masked in API responses unless permission granted
    cpf: Mapped[str | None] = mapped_column(String(14), nullable=True, index=True)
    
    # ── Demographics & Contact ──
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # phone, email
    address: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    # ── Meta ──
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_modified_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Composite index for "Nome + DN + Nome Mãe" search optimization
    __table_args__ = (
        Index("ix_patients_search", "tenant_id", "full_name", "birth_date", "mother_name"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Clinical Models (Multi-Tenant) ──

class ConsultationRecord(Base):
    """
    Persists each consultation cycle.
    Maps to the same data contract as bi-module.js recordCycle().
    """
    __tablename__ = "consultations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # [NEW] Multi-tenancy

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
    first_transcription: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # ── Concurrency & Versioning ──
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_modified_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # [NEW] Multi-tenancy

    iniciais: Mapped[str] = mapped_column(String(20), nullable=False)
    cenario: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    cid_principal: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    cid_desc: Mapped[str] = mapped_column(String(200), nullable=False)
    gravidade_estimada: Mapped[str] = mapped_column(String(20), nullable=False)
    sinais_vitais: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    hora: Mapped[int] = mapped_column(Integer, nullable=True)
    dia_semana: Mapped[str] = mapped_column(String(20), nullable=True)
    
    version: Mapped[int] = mapped_column(Integer, default=1)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentRecord(Base):
    """
    Persists generated clinical documents.
    Maps to documents.js generateAll() output.
    """
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # [NEW] Multi-tenancy

    consultation_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False)  # prescription | attestation | exam_request | patient_guide
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    validated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    version: Mapped[int] = mapped_column(Integer, default=1)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
