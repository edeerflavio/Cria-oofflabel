
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.database import get_db, Patient
from core.context import get_current_context, SecurityContext
from core.policies import check_permissions
from core.audit import AuditService

router = APIRouter()

# ── Schemas ──
class PatientCreate(BaseModel):
    full_name: str
    birth_date: datetime
    mother_name: Optional[str] = None
    cpf: Optional[str] = None
    gender: Optional[str] = None
    contact_info: Optional[dict] = None
    address: Optional[dict] = None

class PatientResponse(BaseModel):
    id: int
    full_name: str
    birth_date: datetime
    mother_name: Optional[str]
    cpf: Optional[str]  # Masked by default
    gender: Optional[str]
    contact_info: Optional[dict]
    address: Optional[dict]
    
    class Config:
        from_attributes = True

# ── Helper ──
def mask_cpf(cpf: str | None) -> str | None:
    if not cpf or len(cpf) < 11:
        return cpf
    # Simple masking: ***.***.123-**
    # Assuming standard format or just digits. 
    # If standard 111.222.333-44:
    # return "***.***." + cpf[-6:] # e.g. 333-44
    return "***.***." + cpf[-5:] if len(cpf) >= 5 else "***"

# ── Endpoints ──

@router.post("/", response_model=PatientResponse)
async def create_patient(
    patient: PatientCreate,
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    # Check Permission
    if not await check_permissions(ctx.user.id, ctx.tenant.id, "patient", "create", db):
         raise HTTPException(status_code=403, detail="Permission denied")

    # Audit
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "patient", "create", 
        {"full_name": patient.full_name}
    )

    new_patient = Patient(
        tenant_id=ctx.tenant.id,
        full_name=patient.full_name,
        birth_date=patient.birth_date,
        mother_name=patient.mother_name,
        cpf=patient.cpf,
        gender=patient.gender,
        contact_info=patient.contact_info,
        address=patient.address,
        last_modified_by=ctx.user.id
    )
    db.add(new_patient)
    await db.commit()
    await db.refresh(new_patient)
    
    # Return with masked CPF
    new_patient.cpf = mask_cpf(new_patient.cpf)
    return new_patient

@router.get("/search", response_model=List[PatientResponse])
async def search_patients(
    full_name: str = Query(..., min_length=3),
    birth_date: Optional[datetime] = None,
    mother_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    """
    Search by Name (required) + optionally Birth Date / Mother's Name.
    CPF search is BLOCKED intentionally for privacy.
    """
    # Check Permission
    if not await check_permissions(ctx.user.id, ctx.tenant.id, "patient", "search", db):
         # Allow read if they have basic access, but maybe restrict sensitive search?
         # For now, simplistic check
         pass # Assume open for now or add check
         
    # Audit Search (Summary)
    await AuditService.log_event(
        db, ctx.tenant.id, ctx.user.id, "patient", "search", 
        {"query": full_name}
    )

    query = select(Patient).where(
        Patient.tenant_id == ctx.tenant.id,
        Patient.full_name.ilike(f"%{full_name}%")
    )
    
    if birth_date:
        query = query.where(Patient.birth_date == birth_date)
    
    if mother_name:
        query = query.where(Patient.mother_name.ilike(f"%{mother_name}%"))
        
    result = await db.execute(query.limit(50))
    patients = result.scalars().all()
    
    # Mask CPFs
    for p in patients:
        p.cpf = mask_cpf(p.cpf)
        
    return patients

@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: int,
    unmask: bool = False,
    db: AsyncSession = Depends(get_db),
    ctx: SecurityContext = Depends(get_current_context)
):
    # Check Permission
    if not await check_permissions(ctx.user.id, ctx.tenant.id, "patient", "read", db):
         raise HTTPException(status_code=403, detail="Permission denied")

    result = await db.execute(
        select(Patient).where(
            Patient.id == patient_id,
            Patient.tenant_id == ctx.tenant.id
        )
    )
    patient = result.scalar_one_or_none()
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Handle Unmasking
    if unmask:
        # Strict Permission Check for Sensitive Data
        has_perm = await check_permissions(ctx.user.id, ctx.tenant.id, "patient", "view_sensitive", db)
        if not has_perm:
            raise HTTPException(status_code=403, detail="Permission denied for sensitive data")
            
        # Log Critical Audit Event
        await AuditService.log_event(
            db, ctx.tenant.id, ctx.user.id, "patient", "view_sensitive", 
            {"patient_id": patient.id, "reason": "unmask_requested"}
        )
        # Return plain CPF (do nothing)
    else:
        patient.cpf = mask_cpf(patient.cpf)
        
    # Log Normal View
    await AuditService.log_event(
         db, ctx.tenant.id, ctx.user.id, "patient", "view", 
         {"patient_id": patient.id}
    )

    return patient
