
import asyncio
import sys
import os

# Add backend directory to path so imports work
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from app.database import AsyncSessionLocal, Tenant, User, TenantUserRole, Role, Permission, RolePermission
from core.auth import get_password_hash

async def seed():
    async with AsyncSessionLocal() as db:
        print("🌱 Seeding database...")
        
        # 1. Create Tenant
        stmt = select(Tenant).where(Tenant.slug == "default")
        result = await db.execute(stmt)
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            tenant = Tenant(name="Default Clinic", slug="default")
            db.add(tenant)
            await db.commit()
            await db.refresh(tenant)
            print(f"✅ Created Tenant: {tenant.name} (id={tenant.id})")
        else:
            print(f"ℹ️ Tenant already exists: {tenant.name}")

        # 2. Create User
        stmt = select(User).where(User.email == "admin@example.com")
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                full_name="System Admin",
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            print(f"✅ Created User: {user.email} (id={user.id})")
        else:
            print(f"ℹ️ User already exists: {user.email}")
            
        # 3. Create Roles & Permissions (Basic)
        # Role: Admin
        stmt = select(Role).where(Role.name == "admin")
        result = await db.execute(stmt)
        role = result.scalar_one_or_none()
        
        if not role:
            role = Role(name="admin", description="Administrator", scope="tenant")
            db.add(role)
            await db.commit()
            await db.refresh(role)
            print(f"✅ Created Role: {role.name}")
            
        # Permission: Read Consultation
        stmt = select(Permission).where(Permission.resource == "consultation", Permission.action == "read")
        result = await db.execute(stmt)
        perm = result.scalar_one_or_none()
        
        if not perm:
            perm = Permission(resource="consultation", action="read")
            db.add(perm)
            await db.commit()
            await db.refresh(perm)
        
        # Link Role -> Permission
        stmt = select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == perm.id)
        if not (await db.execute(stmt)).scalar_one_or_none():
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
            await db.commit()

        # 4. Link User -> Tenant -> Role
        stmt = select(TenantUserRole).where(
            TenantUserRole.user_id == user.id, 
            TenantUserRole.tenant_id == tenant.id
        )
        if not (await db.execute(stmt)).scalar_one_or_none():
            link = TenantUserRole(user_id=user.id, tenant_id=tenant.id, role_id=role.id)
            db.add(link)
            await db.commit()
            print(f"✅ Linked User {user.email} to Tenant {tenant.name} as {role.name}")
        else:
            print(f"ℹ️ User already linked to Tenant.")

if __name__ == "__main__":
    asyncio.run(seed())
