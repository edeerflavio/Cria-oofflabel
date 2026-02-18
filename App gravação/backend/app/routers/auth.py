
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, User, Tenant, TenantUserRole
from core.auth import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from pydantic import BaseModel

router = APIRouter()

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # 1. Authenticate User
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_active:
         raise HTTPException(status_code=400, detail="Inactive user")

    # 2. Resolve Tenant (For now, pick the first one the user belongs to, or use a header/param)
    # Ideally, the user selects a tenant during login or via a separate formatting
    # Here we default to the first associated tenant found.
    
    stmt = (
        select(Tenant)
        .join(TenantUserRole, TenantUserRole.tenant_id == Tenant.id)
        .where(TenantUserRole.user_id == user.id)
        .limit(1)
    )
    result_tenant = await db.execute(stmt)
    tenant = result_tenant.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="User is not associated with any tenant"
        )

    # 3. Create Token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "tenant_id": tenant.id},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
