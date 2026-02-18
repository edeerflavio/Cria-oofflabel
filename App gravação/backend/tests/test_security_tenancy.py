
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from app.database import Tenant, User, Role, Permission, RolePermission, TenantUserRole, ConsultationRecord, AuditEvent
from core.auth import create_access_token

@pytest.mark.asyncio
async def test_tenant_isolation(client: AsyncClient, db_session):
    # Setup: Create Tenant A and Tenant B
    t1 = Tenant(name="Tenant A", slug="tenant-a")
    t2 = Tenant(name="Tenant B", slug="tenant-b")
    db_session.add_all([t1, t2])
    await db_session.commit()

    # Create Users
    u1 = User(email="user1@a.com", hashed_password="pw")
    u2 = User(email="user2@b.com", hashed_password="pw")
    db_session.add_all([u1, u2])
    await db_session.commit()

    # Assign Roles (admin for simplicity to bypass permission checks, focusing on isolation)
    r_admin = Role(name="admin", description="Admin", scope="tenant")
    db_session.add(r_admin)
    await db_session.commit()
    
    # Assign User1 -> Tenant1, User2 -> Tenant2
    db_session.add(TenantUserRole(user_id=u1.id, tenant_id=t1.id, role_id=r_admin.id))
    db_session.add(TenantUserRole(user_id=u2.id, tenant_id=t2.id, role_id=r_admin.id))
    await db_session.commit()

    # Create Consultation for Tenant A
    c1 = ConsultationRecord(tenant_id=t1.id, paciente_id="P1", texto_transcrito="Secret A")
    db_session.add(c1)
    await db_session.commit()

    # Login as User 2 (Tenant B)
    token = create_access_token({"sub": str(u2.id), "tenant_id": t2.id})
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt to fetch Consultation 1 (Tenant A) via ID
    response = await client.get(f"/api/v1/consultations/{c1.id}", headers=headers)
    
    # Expect 404 Not Found (or 403, but typically 404 for isolation "it doesn't exist for you")
    assert response.status_code == 404

    # Attempt to list consultations
    response = await client.get("/api/v1/consultations", headers=headers)
    data = response.json()
    assert len(data) == 0  # Should verify we see nothing from Tenant A

@pytest.mark.asyncio
async def test_audit_logging(client: AsyncClient, db_session):
    # Setup Tenant/User
    t = Tenant(name="AuditTenant", slug="audit")
    u = User(email="audit@test.com", hashed_password="pw")
    db_session.add_all([t, u])
    await db_session.commit()
    
    r = Role(name="viewer", description="Viewer", scope="tenant")
    db_session.add(r)
    await db_session.commit()
    
    db_session.add(TenantUserRole(user_id=u.id, tenant_id=t.id, role_id=r.id))
    
    # Add permission
    p = Permission(resource="bi", action="view_stats")
    db_session.add(p)
    await db_session.commit()
    db_session.add(RolePermission(role_id=r.id, permission_id=p.id))
    await db_session.commit()

    token = create_access_token({"sub": str(u.id), "tenant_id": t.id})
    headers = {"Authorization": f"Bearer {token}"}

    # Perform Action
    await client.get("/api/v1/bi/stats", headers=headers)

    # Verify Audit Log
    result = await db_session.execute(select(AuditEvent).where(AuditEvent.action == "view_stats"))
    event = result.scalar_one_or_none()
    
    assert event is not None
    assert event.user_id == u.id
    assert event.tenant_id == t.id
    assert event.resource == "bi"
