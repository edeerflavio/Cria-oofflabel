
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AuditEvent
from core.middleware import get_correlation_id
from datetime import datetime
import json

class AuditService:
    @staticmethod
    async def log_event(
        db: AsyncSession,
        tenant_id: int,
        user_id: int,
        resource: str,
        action: str,
        details: dict = None
    ):
        """
        Logs a security/business event to the audit_events table.
        Automatically injects correlation_id if available.
        """
        correlation_id = get_correlation_id()
        
        final_details = details or {}
        if correlation_id:
             final_details["correlation_id"] = correlation_id

        event = AuditEvent(
            tenant_id=tenant_id,
            user_id=user_id,
            resource=resource,
            action=action,
            details=final_details,
            timestamp=datetime.utcnow()
        )
        db.add(event)
        # Note: We rely on the caller to commit via the main transaction, 
        # or we could force a commit here if we want audit to persist even on failure.
        # For now, we assume part of the same transaction.
