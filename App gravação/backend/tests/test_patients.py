
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from app.database import Tenant, User, Role, Permission, RolePermission, TenantUserRole, Patient, AuditEvent
from core.auth import create_access_token
from datetime import datetime

@pytest.mark.asyncio
async def test_patient_isolation(client: AsyncClient, db_session):
    # Setup Tenants
    t1 = Tenant(name="PtTenant A", slug="pt-a")
    t2 = Tenant(name="PtTenant B", slug="pt-b")
    db_session.add_all([t1, t2])
    await db_session.commit()

    # Users
    u1 = User(email="p1@a.com", hashed_password="pw")
    u2 = User(email="p2@b.com", hashed_password="pw")
    db_session.add_all([u1, u2])
    await db_session.commit()
    
    # Roles
    r_admin = Role(name="admin_pt", description="Admin", scope="tenant")
    db_session.add(r_admin)
    await db_session.commit()
    
    # Links
    db_session.add(TenantUserRole(user_id=u1.id, tenant_id=t1.id, role_id=r_admin.id))
    db_session.add(TenantUserRole(user_id=u2.id, tenant_id=t2.id, role_id=r_admin.id))
    await db_session.commit()

    # Data: Patient in Tenant A
    p_a = Patient(
        tenant_id=t1.id, 
        full_name="Alice Smith", 
        birth_date=datetime(1990, 1, 1),
        cpf="12345678900"
    )
    db_session.add(p_a)
    await db_session.commit()

    # Test: User 2 (Tenant B) searches for "Alice"
    token = create_access_token({"sub": str(u2.id), "tenant_id": t2.id})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = await client.get("/api/v1/patients/search?full_name=Alice", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0  # Should be empty for Tenant B

    # Test: User 1 (Tenant A) searches for "Alice"
    token_a = create_access_token({"sub": str(u1.id), "tenant_id": t1.id})
    headers_a = {"Authorization": f"Bearer {token_a}"}
    
    response = await client.get("/api/v1/patients/search?full_name=Alice", headers=headers_a)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["full_name"] == "Alice Smith"
    # Verify Masking
    assert "***" in data[0]["cpf"]

@pytest.mark.asyncio
async def test_patient_unmask_audit(client: AsyncClient, db_session):
    # Setup Tenant/User/Role
    t = Tenant(name="AuditPt", slug="audit-pt")
    u = User(email="audit-pt@test.com", hashed_password="pw")
    db_session.add_all([t, u])
    await db_session.commit()
    
    r = Role(name="doc", description="Doctor", scope="tenant")
    db_session.add(r)
    await db_session.commit()
    
    # Permission: view_sensitive
    perm = Permission(resource="patient", action="view_sensitive")
    db_session.add(perm)
    await db_session.commit()
    db_session.add(RolePermission(role_id=r.id, permission_id=perm.id))
    
    # Permission: read (needed for get_patient)
    perm_read = Permission(resource="patient", action="read")
    db_session.add(perm_read)
    await db_session.commit()
    db_session.add(RolePermission(role_id=r.id, permission_id=perm_read.id))
    
    db_session.add(TenantUserRole(user_id=u.id, tenant_id=t.id, role_id=r.id))
    await db_session.commit()
    
    # Patient
    p = Patient(
        tenant_id=t.id, 
        full_name="Bob Sensitive", 
        birth_date=datetime(1980, 1, 1),
        cpf="11122233344"
    )
    db_session.add(p)
    await db_session.commit()

    token = create_access_token({"sub": str(u.id), "tenant_id": t.id})
    headers = {"Authorization": f"Bearer {token}"}

    # Action: Request Unmasked
    response = await client.get(f"/api/v1/patients/{p.id}?unmask=true", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["cpf"] == "11122233344"  # Plain text

    # Verify Audit
    result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.action == "view_sensitive")
    )
    event = result.scalar_one_or_none()
    assert event is not None
    assert event.details["patient_id"] == p.id
    assert event.user_id == u.id
