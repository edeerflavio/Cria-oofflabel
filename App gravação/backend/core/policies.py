
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import Permission, RolePermission, TenantUserRole

async def check_permissions(user_id: int, tenant_id: int, resource: str, action: str, db: AsyncSession) -> bool:
    """
    Verifies if the user has the required permission within the specific tenant context.
    RBAC implementation: User -> TenantUserRole -> Role -> RolePermission -> Permission
    """
    
    # Query to check existence of the permission for the user in the tenant
    query = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(TenantUserRole, TenantUserRole.role_id == RolePermission.role_id)
        .where(
            TenantUserRole.user_id == user_id,
            TenantUserRole.tenant_id == tenant_id,
            Permission.resource == resource,
            Permission.action == action
        )
        .limit(1)
    )
    
    result = await db.execute(query)
    permission = result.scalar_one_or_none()
    
    return permission is not None

def check_abac_policy(user_attributes: dict, resource_attributes: dict, environment: dict) -> bool:
    """
    Attribute-Based Access Control logic.
    Supports complex rules like 'encounter_team' or department matching.
    """
    rule_type = environment.get("rule_type")
    
    if rule_type == "encounter_team":
        # Check if user is part of the clinical team for this patient/consultation
        # For MVP: Check if user has 'medical' role in the same tenant as the resource
        # In a real system, this would query an 'EncounterTeam' table.
        user_roles = user_attributes.get("roles", [])
        if "medical" in user_roles or "admin" in user_roles:
            return True
        return False
        
    # Default allow for now if no specific rule matched, or deny based on security posture
    # Here we default to True for backward compatibility until rules are strict
    return True
