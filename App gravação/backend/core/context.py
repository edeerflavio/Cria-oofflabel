
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db, User, Tenant, TenantUserRole
from core.auth import decode_access_token

# Define SecurityContext
class SecurityContext(BaseModel):
    user: User
    tenant: Tenant
    
    class Config:
        arbitrary_types_allowed = True

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Retrieve current user from JWT token."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id: str = payload.get("sub")
    if user_id is None:
         raise HTTPException(status_code=401, detail="Invalid token payload")
         
    # Query DB
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

async def get_current_context(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> SecurityContext:
    """Retrieve both User and Tenant context from token."""
    payload = decode_access_token(token)
    if not payload:
        # Fallback to dev/mock context logic if token fails?
        # main.py enforces auth, so let's stick to real auth.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    if not user_id or not tenant_id:
        raise HTTPException(status_code=401, detail="Invalid token payload (missing sub or tenant_id)")

    # Fetch User
    user_result = await db.execute(select(User).where(User.id == int(user_id)))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Fetch Tenant
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == int(tenant_id)))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=401, detail="Tenant not found")

    # Verify association (optional, but good security)
    assoc_result = await db.execute(
        select(TenantUserRole).where(
            TenantUserRole.user_id == user.id,
            TenantUserRole.tenant_id == tenant.id
        )
    )
    if not assoc_result.scalar_one_or_none():
         raise HTTPException(status_code=403, detail="User does not belong to this tenant")

    return SecurityContext(user=user, tenant=tenant)
