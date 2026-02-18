
import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from contextvars import ContextVar

# ContextVar to store request ID globally for the request scope
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default=None)

class RequestCorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        
        # 1. Extract or Generate ID
        correlation_id = request.headers.get("X-Request-ID")
        if not correlation_id:
            correlation_id = str(uuid.uuid4())
            
        # 2. Set Context
        token = correlation_id_ctx.set(correlation_id)
        
        try:
            # 3. Process Request
            response = await call_next(request)
            
            # 4. Inject into Response Header
            response.headers["X-Request-ID"] = correlation_id
            return response
            
        finally:
            # 5. Cleanup
            correlation_id_ctx.reset(token)

def get_correlation_id() -> str:
    return correlation_id_ctx.get()
