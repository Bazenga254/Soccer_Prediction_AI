"""
Admin Routes for Spark AI - Extracted from main.py
All /api/admin/* endpoints with RBAC integration and activity logging.
"""

from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from pathlib import Path
from datetime import datetime, timedelta, timezone
import uuid
import os
import sqlite3

import user_auth
import access_codes
import community
import subscriptions
import prediction_tracker
import bot_manager
import daraja_payment
import whop_payment
import admin_rbac
import activity_logger
import pricing_config
import social_media_hub
import promotional_packages
import blog

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# Support file upload config
SUPPORT_UPLOADS_DIR = Path(__file__).parent / "uploads" / "support"
MAX_SUPPORT_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_SUPPORT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt", ".csv", ".xls", ".xlsx"}


# ─── Request Models ───

class AdminLoginRequest(BaseModel):
    password: str

class CreateCodeRequest(BaseModel):
    days_valid: int = 30
    label: str = ""

class AdminResetPasswordRequest(BaseModel):
    new_password: str

class SetTierRequest(BaseModel):
    tier: str
    days: int = None  # Optional: auto-expire pro after N days (1-30)

class SetActiveRequest(BaseModel):
    is_active: bool
    reason: Optional[str] = None
    custom_note: Optional[str] = None

class SetRoleRequest(BaseModel):
    role: Optional[str] = None

class CreateStaffRequest(BaseModel):
    email: str
    password: str
    display_name: str
    role: str

class SupportMessageRequest(BaseModel):
    content: str
    category: str = None

class AdminWithdrawalAction(BaseModel):
    admin_notes: str = ""

class AdjustBalanceRequest(BaseModel):
    amount_usd: float = 0.0
    amount_kes: float = 0.0
    reason: str = ""
    adjustment_type: str = "admin_adjust"

class AssignRoleRequest(BaseModel):
    role_id: int

class UserPermissionsRequest(BaseModel):
    permissions: Dict  # {module: {can_read: -1|0|1, can_write: -1|0|1, ...}}

class CreateRoleRequest(BaseModel):
    name: str
    display_name: str
    level: int
    department: Optional[str] = None
    description: str = ""

class UpdatePermissionRequest(BaseModel):
    module: str
    read: int = 0
    write: int = 0
    edit: int = 0
    delete: int = 0
    export: int = 0

class BroadcastRequest(BaseModel):
    title: str
    message: str
    channel: str = "email"
    target_type: str = "all"
    target_user_ids: Optional[List[int]] = None
    target_user_names: Optional[List[str]] = None

class RejectBroadcastRequest(BaseModel):
    reason: str = ""
    approve: int = 0
    scope: str = "own"

class CreateBotsRequest(BaseModel):
    count: int
    name_prefix: str = ""

class BotIdsRequest(BaseModel):
    bot_ids: List[int]

class AssignBotsRequest(BaseModel):
    bot_ids: List[int]
    employee_user_id: int

class BotActionRequest(BaseModel):
    bot_id: int
    action: str
    target_id: str = ""
    message: str = ""
    reaction: str = ""

class UpdatePricingConfigRequest(BaseModel):
    updates: dict

class CreatePlanRequest(BaseModel):
    plan_id: str
    name: str
    price: float
    currency: str = "USD"
    duration_days: int
    features: list = []

class DeletePlanRequest(BaseModel):
    plan_id: str

class BotBatchActionRequest(BaseModel):
    bot_ids: List[int]
    action: str
    target_id: str = ""
    message: str = ""
    reaction: str = ""

class BotStaggeredBatchRequest(BaseModel):
    bot_ids: List[int]
    action: str
    target_id: str = ""
    message: str = ""
    reaction: str = ""
    delay_min: int = 30
    delay_max: int = 40
    messages_list: List[str] = []

class BotCreatePredictionRequest(BaseModel):
    bot_id: int
    fixture_id: str
    team_a_name: str
    team_b_name: str
    competition: str = ""
    predicted_result: str = ""
    analysis_summary: str = ""
    predicted_over25: str = None
    predicted_btts: str = None
    odds: float = None

class BotBatchCreatePredictionRequest(BaseModel):
    bot_ids: List[int]
    fixture_id: str
    team_a_name: str
    team_b_name: str
    competition: str = ""
    predictions: List[dict] = []
    delay_min: int = 30
    delay_max: int = 40


# ─── Auth Helpers ───

def _get_current_user(authorization: str = None):
    """Extract user from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    payload = user_auth.verify_token(token)
    if payload and payload.get("user_id"):
        fresh_tier = user_auth.get_user_tier(payload["user_id"])
        if fresh_tier is not None:
            payload["tier"] = fresh_tier
    return payload


def _check_admin_auth(
    x_admin_password: str = None,
    authorization: str = None,
    required_roles: set = None,
    required_module: str = None,
    required_action: str = "read",
):
    """Check admin auth via password OR JWT staff role.
    Supports both legacy role checks and new RBAC module/action checks.
    Returns auth info dict or None.
    """
    # Legacy password auth (treated as owner)
    if x_admin_password and x_admin_password == ADMIN_PASSWORD:
        return {
            "auth_type": "password",
            "user_id": None,
            "staff_role": "super_admin",
            "role_name": "owner",
            "role_level": 0,
            "display_name": "Admin",
        }

    # JWT-based staff auth
    if authorization:
        payload = _get_current_user(authorization)
        if payload:
            user_id = payload["user_id"]

            # Try new RBAC system first
            role_info = admin_rbac.get_user_role(user_id)
            if role_info:
                # New RBAC permission check
                if required_module:
                    if not admin_rbac.has_permission(user_id, required_module, required_action):
                        return None
                elif required_roles:
                    # Legacy role check only when no RBAC module specified
                    legacy_role = user_auth.get_staff_role(user_id)
                    if legacy_role and legacy_role not in required_roles:
                        return None

                profile = user_auth.get_user_profile(user_id)
                return {
                    "auth_type": "jwt",
                    "user_id": user_id,
                    "staff_role": user_auth.get_staff_role(user_id) or role_info["name"],
                    "role_name": role_info["name"],
                    "role_level": role_info["level"],
                    "department": role_info.get("department"),
                    "display_name": profile["display_name"] if profile else f"Agent {user_id}",
                }

            # Fallback: legacy staff_role check (for unmigrated users)
            legacy_role = user_auth.get_staff_role(user_id)
            if legacy_role:
                if required_roles and legacy_role not in required_roles:
                    return None
                profile = user_auth.get_user_profile(user_id)
                return {
                    "auth_type": "jwt",
                    "user_id": user_id,
                    "staff_role": legacy_role,
                    "role_name": legacy_role,
                    "role_level": 3,
                    "display_name": profile["display_name"] if profile else f"Agent {user_id}",
                }

    return None


def _get_client_ip(request: Request) -> str:
    """Extract client IP, checking X-Forwarded-For for proxied requests."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _log_action(auth: dict, action: str, module: str, request: Request,
                target_type: str = None, target_id: int = None, details: dict = None):
    """Helper to log an admin action."""
    activity_logger.log_action(
        user_id=auth.get("user_id") or 0,
        action=action,
        module=module,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


# ═══════════════════════════════════════════════════════════
#  AUTHENTICATION
# ═══════════════════════════════════════════════════════════

@admin_router.post("/login")
async def admin_login(request: Request, body: AdminLoginRequest, authorization: str = Header(None)):
    """Admin login - password or staff JWT."""
    if body.password == ADMIN_PASSWORD:
        activity_logger.log_action(
            user_id=0, action="login", module="security",
            details={"method": "password", "role": "owner"},
            ip_address=_get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
        return {"success": True, "message": "Admin authenticated", "role": "owner"}

    if authorization:
        payload = _get_current_user(authorization)
        if payload:
            user_id = payload["user_id"]
            role_info = admin_rbac.get_user_role(user_id)
            legacy_role = user_auth.get_staff_role(user_id)

            if role_info or legacy_role:
                # Create staff session
                import hashlib
                token_hash = hashlib.sha256(authorization.encode()).hexdigest()[:32]
                activity_logger.create_staff_session(
                    user_id=user_id,
                    token_hash=token_hash,
                    ip_address=_get_client_ip(request),
                    user_agent=request.headers.get("user-agent", ""),
                )
                activity_logger.log_action(
                    user_id=user_id, action="login", module="security",
                    details={"method": "jwt", "role": role_info["name"] if role_info else legacy_role},
                    ip_address=_get_client_ip(request),
                    user_agent=request.headers.get("user-agent", ""),
                )

                return {
                    "success": True,
                    "message": "Staff authenticated",
                    "staff_role": legacy_role,
                    "role": role_info if role_info else {"name": legacy_role},
                }

    raise HTTPException(status_code=401, detail="Invalid admin password")


@admin_router.post("/logout")
async def admin_logout(request: Request, authorization: str = Header(None)):
    """Admin logout - end session."""
    if authorization:
        payload = _get_current_user(authorization)
        if payload:
            activity_logger.end_staff_session(payload["user_id"])
            activity_logger.log_action(
                user_id=payload["user_id"], action="logout", module="security",
                ip_address=_get_client_ip(request),
                user_agent=request.headers.get("user-agent", ""),
            )
    return {"success": True}


# ═══════════════════════════════════════════════════════════
#  RBAC - Roles & Permissions
# ═══════════════════════════════════════════════════════════

@admin_router.get("/my-permissions")
async def get_my_permissions(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get the current admin user's role and permissions."""
    auth = _check_admin_auth(x_admin_password, authorization)
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if auth["auth_type"] == "password":
        # Password auth = owner = all permissions
        return {
            "role": {"name": "owner", "display_name": "Owner", "level": 0, "department": None},
            "modules": [
                {"module": m, "can_read": 1, "can_write": 1, "can_edit": 1,
                 "can_delete": 1, "can_export": 1, "can_approve": 1, "data_scope": "company"}
                for m in admin_rbac.ALL_MODULES
            ],
        }

    role_info = admin_rbac.get_user_role(auth["user_id"])
    modules = admin_rbac.get_accessible_modules(auth["user_id"])
    return {"role": role_info, "modules": modules}


@admin_router.get("/roles")
async def list_roles(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all roles with staff counts."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"roles": admin_rbac.get_all_roles()}


@admin_router.post("/roles")
async def create_role(request: Request, body: CreateRoleRequest,
                      x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a new custom role (owner only)."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="security", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = admin_rbac.create_role(body.name, body.display_name, body.level, body.department, body.description)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "create_role", "security", request, "role", result["role_id"], {"name": body.name})
    return result


@admin_router.put("/roles/{role_id}")
async def update_role_permissions(role_id: int, request: Request, body: UpdatePermissionRequest,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Update permissions for a role on a module (owner only)."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="security", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = admin_rbac.update_role_permission(role_id, body.module, {
        "read": body.read, "write": body.write, "edit": body.edit,
        "delete": body.delete, "export": body.export, "approve": body.approve, "scope": body.scope,
    })
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "update_permission", "security", request, "role", role_id, {"module": body.module})
    return result


@admin_router.get("/roles/{role_id}/permissions")
async def get_role_perms(role_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get all permissions for a specific role."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"permissions": admin_rbac.get_role_permissions(role_id)}


# ═══════════════════════════════════════════════════════════
#  ACTIVITY LOGS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/activity-logs")
async def get_activity_logs(
    user_id: int = None, action: str = None, module: str = None,
    from_date: str = None, to_date: str = None,
    page: int = 1, per_page: int = 50,
    x_admin_password: str = Header(None), authorization: str = Header(None),
):
    """Query activity logs with filters."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="activity_logs", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Check data scope
    scope = "company"
    if auth.get("user_id"):
        scope = admin_rbac.get_data_scope(auth["user_id"], "activity_logs")

    if scope == "own":
        user_id = auth["user_id"]
    elif scope == "department" and auth.get("department"):
        pass  # TODO: filter by department users

    return activity_logger.get_activity_logs(user_id, action, module, from_date, to_date, page, per_page)


@admin_router.get("/activity-stats")
async def get_activity_stats_endpoint(
    days: int = 7,
    x_admin_password: str = Header(None), authorization: str = Header(None),
):
    """Get activity log statistics for dashboard."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="activity_logs", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return activity_logger.get_activity_stats(days)


@admin_router.get("/staff/{user_id}/activity")
async def get_staff_activity(user_id: int, days: int = 30,
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get a specific staff member's activity."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="activity_logs", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"activity": activity_logger.get_user_activity(user_id, days)}


# ═══════════════════════════════════════════════════════════
#  STAFF SESSIONS & SECURITY
# ═══════════════════════════════════════════════════════════

@admin_router.get("/staff/sessions")
async def get_active_sessions(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get all active staff sessions."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="security", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"sessions": activity_logger.get_active_staff_sessions()}


@admin_router.post("/staff/{user_id}/terminate-session")
async def terminate_staff_session(user_id: int, request: Request,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Force terminate a staff member's session (owner only)."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="security", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = activity_logger.terminate_session(user_id)
    _log_action(auth, "terminate_session", "security", request, "user", user_id)
    return result


@admin_router.get("/staff/{user_id}/login-history")
async def get_staff_login_history(user_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get login history for a staff member."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="security", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"history": activity_logger.get_login_history(user_id)}


@admin_router.post("/staff/heartbeat")
async def staff_heartbeat(authorization: str = Header(None)):
    """Update staff session activity (called periodically by frontend)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    activity_logger.update_session_activity(payload["user_id"])
    return {"success": True}


# ═══════════════════════════════════════════════════════════
#  ACCESS CODES
# ═══════════════════════════════════════════════════════════

@admin_router.post("/codes/create")
async def create_code(request: Request, body: CreateCodeRequest,
                      x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a new access code."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="access_codes", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = access_codes.create_access_code(days_valid=body.days_valid, label=body.label)
    _log_action(auth, "create_code", "access_codes", request, details={"label": body.label, "days": body.days_valid})
    return result


@admin_router.get("/codes")
async def list_codes(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all access codes."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="access_codes", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"codes": access_codes.list_all_codes()}


@admin_router.delete("/codes/{code}")
async def revoke_code(code: str, request: Request,
                      x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Revoke an access code."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="access_codes", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    success = access_codes.revoke_code(code)
    if success:
        _log_action(auth, "revoke_code", "access_codes", request, details={"code": code})
        return {"message": f"Code {code} revoked"}
    raise HTTPException(status_code=404, detail="Code not found")


# ═══════════════════════════════════════════════════════════
#  PROMOTIONAL PACKAGES
# ═══════════════════════════════════════════════════════════

class CreatePromoRequest(BaseModel):
    name: str
    pro_days: int
    max_slots: int
    code: str = ""
    expires_at: str = ""
    description: str = ""

class TogglePromoRequest(BaseModel):
    is_active: bool

@admin_router.post("/promos")
async def admin_create_promo(body: CreatePromoRequest, request: Request,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a new promotional package."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="settings", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if body.pro_days < 1 or body.pro_days > 365:
        raise HTTPException(status_code=400, detail="Pro days must be between 1 and 365")
    if body.max_slots < 1:
        raise HTTPException(status_code=400, detail="Max slots must be at least 1")
    result = promotional_packages.create_promo(
        name=body.name, pro_days=body.pro_days, max_slots=body.max_slots,
        code=body.code or None, expires_at=body.expires_at or None,
        description=body.description,
        created_by=auth.get("display_name", "Admin"),
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create promo"))
    _log_action(auth, "create_promo", "settings", request, details={"name": body.name, "code": result.get("code")})
    return result

@admin_router.get("/promos")
async def admin_list_promos(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all promotional packages."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="settings", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"promos": promotional_packages.list_all_promos()}

@admin_router.put("/promos/{promo_id}/toggle")
async def admin_toggle_promo(promo_id: int, body: TogglePromoRequest, request: Request,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Activate or deactivate a promo."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="settings", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    promotional_packages.toggle_promo(promo_id, body.is_active)
    _log_action(auth, "toggle_promo", "settings", request, details={"promo_id": promo_id, "is_active": body.is_active})
    return {"success": True}

@admin_router.delete("/promos/{promo_id}")
async def admin_delete_promo(promo_id: int, request: Request,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Delete a promotional package."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="settings", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    promotional_packages.delete_promo(promo_id)
    _log_action(auth, "delete_promo", "settings", request, details={"promo_id": promo_id})
    return {"success": True}


# ═══════════════════════════════════════════════════════════
#  DASHBOARD & ANALYTICS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/dashboard-stats")
async def admin_dashboard_stats(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get full dashboard statistics."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'}, required_module="dashboard", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_stats = user_auth.get_user_stats()
    community_stats = community.get_community_stats()
    prediction_stats = prediction_tracker.get_accuracy_stats()
    sub_stats = subscriptions.get_subscription_stats()

    try:
        balance_stats = community.get_balance_adjustment_stats()
    except Exception:
        balance_stats = None

    # Activity stats for dashboard
    try:
        act_stats = activity_logger.get_activity_stats(7)
    except Exception:
        act_stats = None

    # Active staff sessions
    try:
        active_sessions = activity_logger.get_active_staff_sessions()
        staff_online = len(active_sessions)
    except Exception:
        staff_online = 0

    return {
        "users": user_stats,
        "community": community_stats,
        "predictions": prediction_stats,
        "subscriptions": sub_stats,
        "balance_adjustments": balance_stats,
        "activity": act_stats,
        "staff_online": staff_online,
    }


@admin_router.get("/transaction-analytics")
async def admin_transaction_analytics(
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
    currency: str = Query("kes"),
    start_date: str = Query(None),
    end_date: str = Query(None),
):
    """Get transaction analytics for a specific currency with optional date range."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'}, required_module="dashboard", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    cur = currency.lower()
    if cur not in ("kes", "usd", "whop", "crypto"):
        cur = "kes"

    # Kenyan time = UTC+3
    EAT = timezone(timedelta(hours=3))
    now_eat = datetime.now(EAT)
    now_str = now_eat.strftime("%Y-%m-%d %H:%M:%S")

    # Chart date range
    if start_date and end_date:
        range_start = f"{start_date} 00:00:00"
        range_end = f"{end_date} 23:59:59"
        d_start = datetime.strptime(start_date, "%Y-%m-%d")
        d_end = datetime.strptime(end_date, "%Y-%m-%d")
    else:
        d_start = (now_eat - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_end = now_eat
        range_start = d_start.strftime("%Y-%m-%d %H:%M:%S")
        range_end = now_str

    # Standard period boundaries
    today_start = now_eat.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    days_since_monday = now_eat.weekday()
    week_start = (now_eat - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    month_start = now_eat.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect("community.db", timeout=10)
    conn.row_factory = sqlite3.Row

    def _q(sql, params=()):
        try:
            return conn.execute(sql, params).fetchone()
        except Exception:
            return None

    def _qa(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    if cur == "kes":
        tbl, amt_col = "payment_transactions", "amount_kes"
        status_cond = "payment_status IN ('completed', 'confirmed')"
    elif cur == "whop":
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed' AND transaction_type = 'marketplace_subscription'"
    elif cur == "crypto":
        tbl, amt_col = "coinbase_transactions", "amount_usd"
        status_cond = "payment_status = 'completed'"
    else:  # usd (card)
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed' AND transaction_type != 'marketplace_subscription'"

    # Summary cards: today / this week / this month
    daily = _q(f"SELECT COALESCE(SUM({amt_col}), 0) as total, COUNT(*) as count FROM {tbl} WHERE {status_cond} AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)", (today_start, now_str))
    weekly = _q(f"SELECT COALESCE(SUM({amt_col}), 0) as total, COUNT(*) as count FROM {tbl} WHERE {status_cond} AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)", (week_start, now_str))
    monthly = _q(f"SELECT COALESCE(SUM({amt_col}), 0) as total, COUNT(*) as count FROM {tbl} WHERE {status_cond} AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)", (month_start, now_str))

    # Range total
    range_total = _q(f"SELECT COALESCE(SUM({amt_col}), 0) as total, COUNT(*) as count FROM {tbl} WHERE {status_cond} AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)", (range_start, range_end))

    # Chart data (day-by-day)
    chart_rows = _qa(f"SELECT date(completed_at) as day, COALESCE(SUM({amt_col}), 0) as total FROM {tbl} WHERE {status_cond} AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?) GROUP BY date(completed_at) ORDER BY day", (range_start, range_end))

    conn.close()

    by_day = {r["day"]: r["total"] for r in chart_rows}
    chart_labels = []
    chart_data = []
    num_days = min((d_end - d_start).days + 1, 366)
    for i in range(num_days):
        d = (d_start + timedelta(days=i)).strftime("%Y-%m-%d")
        chart_labels.append(d)
        chart_data.append(round(by_day.get(d, 0), 2))

    return {
        "timezone": "EAT (UTC+3)",
        "current_time": now_str,
        "currency": cur,
        "daily": {"total": round(daily["total"], 2) if daily else 0, "count": daily["count"] if daily else 0},
        "weekly": {"total": round(weekly["total"], 2) if weekly else 0, "count": weekly["count"] if weekly else 0},
        "monthly": {"total": round(monthly["total"], 2) if monthly else 0, "count": monthly["count"] if monthly else 0},
        "range": {
            "start": start_date or d_start.strftime("%Y-%m-%d"),
            "end": end_date or d_end.strftime("%Y-%m-%d"),
            "total": round(range_total["total"], 2) if range_total else 0,
            "count": range_total["count"] if range_total else 0,
        },
        "chart_labels": chart_labels,
        "chart": chart_data,
    }



@admin_router.get("/transactions")
async def admin_list_transactions(
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
    method: str = Query("mpesa"),
    period: str = Query("all"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """List individual transactions with user details, filtered by payment method and time period."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'},
                             required_module="sales", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    EAT = timezone(timedelta(hours=3))
    now_eat = datetime.now(EAT)

    if period == "daily":
        period_start = now_eat.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    elif period == "weekly":
        days_since_monday = now_eat.weekday()
        period_start = (now_eat - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    elif period == "monthly":
        period_start = now_eat.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    else:
        period_start = None

    conn = sqlite3.connect("community.db", timeout=10)
    conn.row_factory = sqlite3.Row

    if method == "mpesa":
        base_sql = """SELECT id, user_id, transaction_type, reference_id,
                      amount_kes, amount_usd, exchange_rate, phone_number,
                      mpesa_receipt, payment_status, created_at, completed_at
                      FROM payment_transactions"""
        count_sql = "SELECT COUNT(*) as total FROM payment_transactions"
        sum_sql = """SELECT COALESCE(SUM(amount_kes), 0) as total_kes,
                     COALESCE(SUM(amount_usd), 0) as total_usd, COUNT(*) as count
                     FROM payment_transactions WHERE payment_status IN ('completed', 'confirmed')"""
    elif method in ("whop", "card"):
        base_sql = """SELECT id, user_id, transaction_type, reference_id,
                      amount_usd, whop_checkout_id, whop_payment_id,
                      payment_status, metadata, created_at, completed_at
                      FROM whop_transactions"""
        count_sql = "SELECT COUNT(*) as total FROM whop_transactions"
        sum_sql = """SELECT COALESCE(SUM(amount_usd), 0) as total_usd, COUNT(*) as count
                     FROM whop_transactions WHERE payment_status = 'completed'"""
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid method. Use: mpesa, whop, card")

    where_clauses = []
    params = []
    if period_start:
        where_clauses.append("datetime(created_at) >= datetime(?)")
        params.append(period_start)

    where_str = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    total_row = conn.execute(count_sql + where_str, params).fetchone()
    total_count = total_row["total"] if total_row else 0

    if period_start:
        sum_sql_filtered = sum_sql + " AND datetime(completed_at) >= datetime(?)"
        summary_row = conn.execute(sum_sql_filtered, [period_start]).fetchone()
    else:
        summary_row = conn.execute(sum_sql).fetchone()

    rows = conn.execute(
        base_sql + where_str + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()
    conn.close()

    transactions = [dict(r) for r in rows]

    user_ids = list(set(t["user_id"] for t in transactions))
    user_map = {}
    balance_map = {}

    if user_ids:
        uconn = user_auth._get_db()
        placeholders = ",".join("?" * len(user_ids))
        user_rows = uconn.execute(
            f"SELECT id, display_name, username, email FROM users WHERE id IN ({placeholders})", user_ids
        ).fetchall()
        uconn.close()
        user_map = {r["id"]: dict(r) for r in user_rows}

        bconn = sqlite3.connect("community.db", timeout=10)
        bconn.row_factory = sqlite3.Row
        bal_rows = bconn.execute(
            f"SELECT user_id, balance_usd, balance_kes, total_deposited_usd, total_deposited_kes FROM user_balances WHERE user_id IN ({placeholders})", user_ids
        ).fetchall()
        bconn.close()
        balance_map = {r["user_id"]: dict(r) for r in bal_rows}

    for t in transactions:
        uid = t["user_id"]
        user = user_map.get(uid, {})
        t["display_name"] = user.get("display_name", "Unknown")
        t["username"] = user.get("username", "")
        t["email"] = user.get("email", "")
        bal = balance_map.get(uid, {})
        t["balance_usd"] = bal.get("balance_usd", 0)
        t["balance_kes"] = bal.get("balance_kes", 0)

    summary = {
        "total_usd": round(summary_row["total_usd"], 2) if summary_row else 0,
        "count": summary_row["count"] if summary_row else 0,
    }
    if method == "mpesa" and summary_row:
        try:
            summary["total_kes"] = round(summary_row["total_kes"], 2)
        except Exception:
            summary["total_kes"] = 0

    return {
        "transactions": transactions,
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "method": method,
        "period": period,
        "summary": summary,
    }


@admin_router.get("/referral-stats")
async def admin_referral_stats(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get referral leaderboard."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="referrals", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"referrals": user_auth.get_all_referral_stats()}


@admin_router.get("/referral-stats/{referrer_id}/referred-users")
async def admin_referred_users(referrer_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get detailed list of users referred by a specific referrer."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="referrals", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"referred_users": user_auth.get_referred_users_detail(referrer_id)}


# ═══════════════════════════════════════════════════════════
#  USER MANAGEMENT
# ═══════════════════════════════════════════════════════════

@admin_router.get("/users")
async def admin_list_users(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all users."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'technical_support'}, required_module="users", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    users = user_auth.list_all_users()
    try:
        tracking = user_auth.get_all_users_tracking_summary()
        for u in users:
            t = tracking.get(u["id"], {})
            u["country_ip"] = t.get("country_ip", "")
            # Fall back to last_known_ip from users table when no tracking record exists
            u["ip_address"] = t.get("ip_address", "") or u.get("last_known_ip", "")
            u["browser"] = t.get("browser", "")
            u["os"] = t.get("os", "")
            u["device_type"] = t.get("device_type", "")
            u["source"] = t.get("source", "Direct")
    except Exception:
        pass
    return {"users": users}


@admin_router.get("/users/{user_id}")
async def admin_get_user(user_id: int, tx_page: int = 1, adj_page: int = 1,
                         x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get full user profile details including subscription, wallet, transactions."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'technical_support', 'customer_care'},
                             required_module="users", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    profile = user_auth.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    conn = user_auth._get_db()
    row = conn.execute("SELECT is_active, login_count, last_login, referred_by FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        profile["is_active"] = bool(row["is_active"])
        profile["login_count"] = row["login_count"]
        profile["last_login"] = row["last_login"]
        profile["referred_by"] = row["referred_by"]

        # Resolve referrer info
        if row["referred_by"]:
            ref_row = conn.execute(
                "SELECT id, username, display_name, email FROM users WHERE id = ?",
                (row["referred_by"],)
            ).fetchone()
            if ref_row:
                profile["referrer"] = {
                    "id": ref_row["id"],
                    "username": ref_row["username"],
                    "display_name": ref_row["display_name"],
                    "email": ref_row["email"],
                }
    conn.close()

    # Credits info
    try:
        profile["credits"] = community.get_user_credits(user_id)
    except Exception:
        profile["credits"] = None

    # Credit usage breakdown
    try:
        profile["credit_usage"] = community.get_credit_usage_breakdown(user_id)
    except Exception:
        profile["credit_usage"] = None

    try:
        profile["subscription"] = subscriptions.get_active_subscription(user_id)
    except Exception:
        profile["subscription"] = None

    try:
        cdb = community._get_db()
        wallet = cdb.execute("SELECT balance_usd, balance_kes, total_earned_usd, total_earned_kes, total_sales FROM creator_wallets WHERE user_id = ?", (user_id,)).fetchone()
        cdb.close()
        if wallet:
            profile["wallet"] = dict(wallet)
        else:
            profile["wallet"] = None
    except Exception:
        profile["wallet"] = None

    try:
        profile["user_balance"] = community.get_user_balance(user_id)
    except Exception:
        profile["user_balance"] = None

    # Paginated balance adjustments (10 per page)
    adj_offset = (max(adj_page, 1) - 1) * 10
    try:
        adj_result = community.get_balance_adjustments(user_id, limit=10, offset=adj_offset, with_total=True)
        profile["balance_adjustments"] = adj_result["items"]
        profile["balance_adjustments_total"] = adj_result["total"]
    except Exception:
        profile["balance_adjustments"] = []
        profile["balance_adjustments_total"] = 0

    # Paginated transactions (10 per page)
    tx_offset = (max(tx_page, 1) - 1) * 10
    try:
        tx_result = daraja_payment.get_user_transactions(user_id, limit=10, offset=tx_offset, with_total=True)
        profile["transactions"] = tx_result["items"]
        profile["transactions_total"] = tx_result["total"]
    except Exception:
        profile["transactions"] = []
        profile["transactions_total"] = 0

    try:
        profile["withdrawals"] = daraja_payment.get_user_withdrawals(user_id)
    except Exception:
        profile["withdrawals"] = []

    try:
        profile["tracking"] = user_auth.get_user_tracking_summary(user_id)
    except Exception:
        profile["tracking"] = None

    return profile


@admin_router.post("/users/{user_id}/set-tier")
async def admin_set_tier(user_id: int, request: Request, body: SetTierRequest,
                         x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Change a user's tier (free/pro)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="users", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if body.tier not in ("free", "pro"):
        raise HTTPException(status_code=400, detail="Tier must be 'free' or 'pro'")
    if body.days is not None and (body.days < 1 or body.days > 30):
        raise HTTPException(status_code=400, detail="Days must be between 1 and 30")
    result = user_auth.set_user_tier(user_id, body.tier, days=body.days)
    _log_action(auth, "set_tier", "users", request, "user", user_id, {"tier": body.tier, "days": body.days})
    return result


@admin_router.post("/users/{user_id}/toggle-active")
async def admin_toggle_active(user_id: int, request: Request, body: SetActiveRequest,
                               x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Suspend or unsuspend a user. When suspending: hides predictions, refunds purchases, notifies buyers, sends email."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'technical_hod'}, required_module="users", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.toggle_user_active(user_id, 1 if body.is_active else 0, reason=body.reason)
    _log_action(auth, "toggle_active", "users", request, "user", user_id,
                {"is_active": body.is_active, "reason": body.reason, "custom_note": body.custom_note})

    # When suspending: hide predictions, refund purchases, notify buyers, send suspension email
    suspension_result = None
    if not body.is_active:
        suspension_result = community.handle_user_suspension(user_id)

        # Send suspension email to user in background
        import threading
        user_info = user_auth.get_user_email_by_id(user_id)
        if user_info and user_info.get("email"):
            threading.Thread(
                target=user_auth.send_suspension_email,
                args=(user_info["email"], user_info.get("display_name", ""), body.reason or "other", body.custom_note or ""),
                daemon=True,
            ).start()

    return {
        "success": True,
        "is_active": body.is_active,
        "suspension": suspension_result,
    }


@admin_router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: int, request: Request, body: AdminResetPasswordRequest,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Admin: reset a user's password."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="users", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.admin_reset_password(user_id, body.new_password)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "reset_password", "users", request, "user", user_id)
    return result


# ═══════════════════════════════════════════════════════════
#  CREATOR ANALYTICS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/creator-analytics")
async def admin_creator_analytics(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get creator analytics with abnormal activity detection."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="community", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return community.get_creator_analytics_admin()


#  COMMUNITY MODERATION
# ═══════════════════════════════════════════════════════════

@admin_router.delete("/community/{prediction_id}")
async def admin_delete_prediction(prediction_id: int, request: Request,
                                   x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Delete a community prediction."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="community", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.delete_prediction(prediction_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    _log_action(auth, "delete_prediction", "community", request, "prediction", prediction_id)
    return result


@admin_router.delete("/comment/{comment_id}")
async def admin_delete_comment(comment_id: int, request: Request,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Delete a specific comment."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="community", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.delete_comment(comment_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    _log_action(auth, "delete_comment", "community", request, "comment", comment_id)
    return result


# ═══════════════════════════════════════════════════════════
#  STAFF MANAGEMENT
# ═══════════════════════════════════════════════════════════

@admin_router.get("/staff")
async def admin_list_staff(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all staff members."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="employees", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Get staff with role info
    staff = user_auth.get_staff_members()
    conn = user_auth._get_db()
    for s in staff:
        role = conn.execute(
            "SELECT r.name, r.display_name, r.level, r.department FROM roles r JOIN users u ON u.role_id = r.id WHERE u.id = ?",
            (s["id"],)
        ).fetchone()
        if role:
            s["role_info"] = dict(role)
        else:
            s["role_info"] = None
    conn.close()
    return {"staff": staff}


@admin_router.post("/staff/{user_id}/set-role")
async def admin_set_staff_role(user_id: int, request: Request, body: SetRoleRequest,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Assign or remove a staff role (legacy endpoint)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="employees", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.set_staff_role(user_id, body.role)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "set_role", "employees", request, "user", user_id, {"role": body.role})
    return result


@admin_router.post("/staff/{user_id}/assign-role")
async def admin_assign_role(user_id: int, request: Request, body: AssignRoleRequest,
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Assign a new RBAC role to a staff member."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Only owner/GM can assign roles
    if auth.get("role_level", 99) > 1:
        raise HTTPException(status_code=403, detail="Insufficient permissions to assign roles")

    result = admin_rbac.assign_role(user_id, body.role_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "assign_role", "employees", request, "user", user_id, {"role_id": body.role_id})
    return result


@admin_router.post("/staff/{user_id}/remove-role")
async def admin_remove_role(user_id: int, request: Request,
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Remove a staff member's role."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = admin_rbac.remove_role(user_id)
    _log_action(auth, "remove_role", "employees", request, "user", user_id)
    return result


@admin_router.get("/roles/permissions")
async def admin_get_all_roles_permissions(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get all roles with their default permission matrices for display in role assignment modal."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return admin_rbac.get_all_roles_permissions()


@admin_router.get("/staff/{user_id}/permissions")
async def admin_get_staff_permissions(user_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get a staff member's role permissions, custom overrides, and effective permissions."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    role_info = admin_rbac.get_user_role(user_id)
    role_perms = admin_rbac.get_role_permissions_by_name(role_info["name"]) if role_info else {}
    custom_overrides = admin_rbac.get_user_custom_permissions(user_id)
    effective = admin_rbac.get_effective_permissions(user_id)

    return {
        "role": role_info,
        "role_permissions": role_perms,
        "custom_overrides": custom_overrides,
        "effective": effective,
    }


@admin_router.post("/staff/{user_id}/permissions")
async def admin_set_staff_permissions(user_id: int, request: Request, body: UserPermissionsRequest,
                                       x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Set custom permission overrides for a staff member."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Only owner/GM can modify permissions
    if auth.get("role_level", 99) > 1:
        raise HTTPException(status_code=403, detail="Insufficient permissions to modify user permissions")

    result = admin_rbac.set_user_custom_permissions(user_id, body.permissions)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to set permissions"))

    _log_action(auth, "set_custom_permissions", "employees", request, "user", user_id,
                {"modules_changed": list(body.permissions.keys())})
    return result


@admin_router.post("/staff/{user_id}/reset-permissions")
async def admin_reset_staff_permissions(user_id: int, request: Request,
                                          x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Reset a staff member's permissions to role defaults (clear all custom overrides)."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="employees", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if auth.get("role_level", 99) > 1:
        raise HTTPException(status_code=403, detail="Insufficient permissions to reset user permissions")

    result = admin_rbac.clear_user_custom_permissions(user_id)
    _log_action(auth, "reset_custom_permissions", "employees", request, "user", user_id)
    return result


@admin_router.post("/staff/create")
async def admin_create_staff(request: Request, body: CreateStaffRequest,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a new staff account. Bypasses captcha and email verification."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="employees", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.create_staff_account(body.email, body.password, body.display_name, body.role)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "create_staff", "employees", request, "user", result.get("user", {}).get("id"),
                {"email": body.email, "role": body.role})
    return result


# ═══════════════════════════════════════════════════════════
#  ACTIVE/ONLINE USERS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/active-users")
async def admin_active_users(detailed: bool = False,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get list of currently active/online users."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="online_users", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    users = community.get_active_users_list()

    if detailed and users:
        for u in users:
            try:
                profile = user_auth.get_user_profile(u["user_id"])
                if profile:
                    u["email"] = profile.get("email", "")
                    u["tier"] = profile.get("tier", "free")
                    u["full_name"] = profile.get("full_name", "")
                    u["created_at"] = profile.get("created_at", "")
                    u["last_login"] = profile.get("last_login", "")
                    u["login_count"] = profile.get("login_count", 0)
                    u["avatar_url"] = profile.get("avatar_url", "")
                sub = subscriptions.get_active_subscription(u["user_id"])
                if sub:
                    u["subscription"] = {
                        "plan": sub.get("plan", ""),
                        "status": sub.get("status", ""),
                        "expires_at": sub.get("expires_at", ""),
                        "days_remaining": sub.get("days_remaining", 0),
                        "price_amount": sub.get("price_amount", 0),
                        "price_currency": sub.get("price_currency", ""),
                    }
                else:
                    u["subscription"] = None
                balance = community.get_user_balance(u["user_id"])
                u["balance"] = balance
            except Exception:
                pass

    return {"active_users": users, "count": len(users)}


# ═══════════════════════════════════════════════════════════
#  SUPPORT CHAT
# ═══════════════════════════════════════════════════════════

@admin_router.get("/support/pending-count")
async def admin_support_pending_count(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get count of active conversations with unread user messages."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"pending_count": community.get_pending_support_count()}


@admin_router.get("/support/conversations")
async def admin_support_conversations(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all support conversations."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"conversations": community.get_support_conversations()}


@admin_router.get("/support/messages/{user_id}")
async def admin_support_messages(user_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get support messages for a specific user."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"messages": community.get_support_messages(user_id, mark_read_for="admin", current_conv_only=True)}


@admin_router.post("/support/send/{user_id}")
async def admin_support_send(user_id: int, request: Request, body: SupportMessageRequest,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Send a support message to a user."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if auth.get("user_id"):
        community.assign_agent_to_conversation(user_id, auth["user_id"], auth["display_name"])
    result = community.send_support_message(
        user_id, "admin", body.content,
        agent_id=auth.get("user_id"),
        agent_name=auth.get("display_name", "Admin"),
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@admin_router.post("/support/close/{user_id}")
async def admin_close_conversation(user_id: int, request: Request,
                                    x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Close a support conversation."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    agent_name = auth.get("display_name", "Admin")
    community.send_support_message(
        user_id, "system",
        f"Chat ended by {agent_name}. We hope we could help! Please rate your experience below.",
        agent_id=auth.get("user_id"), agent_name=agent_name,
    )
    community.close_conversation(user_id, "agent_closed", closed_by_name=agent_name)
    _log_action(auth, "close_conversation", "support", request, "user", user_id)
    return {"success": True}


@admin_router.get("/support/ratings")
async def admin_support_ratings(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get agent rating statistics."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"ratings": community.get_all_agent_ratings(), "recent": community.get_recent_ratings(10)}


@admin_router.post("/support/upload/{user_id}")
async def admin_support_upload_file(user_id: int, file: UploadFile = File(...),
                                     x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Upload a file in support chat (max 10MB)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'customer_care', 'technical_support'},
                             required_module="support", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    contents = await file.read()
    if len(contents) > MAX_SUPPORT_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_SUPPORT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed.")

    SUPPORT_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = SUPPORT_UPLOADS_DIR / unique_name
    with open(filepath, "wb") as f:
        f.write(contents)

    file_url = f"/api/uploads/support/{unique_name}"
    original_name = file.filename or unique_name
    content = f"[FILE:{original_name}]({file_url})"

    if auth.get("user_id"):
        community.assign_agent_to_conversation(user_id, auth["user_id"], auth["display_name"])
    result = community.send_support_message(
        user_id, "admin", content,
        agent_id=auth.get("user_id"),
        agent_name=auth.get("display_name", "Admin"),
    )
    return {"success": True, "file_url": file_url, "file_name": original_name}


# ═══════════════════════════════════════════════════════════
#  WITHDRAWALS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/withdrawals/pending")
async def get_pending_withdrawals(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get all pending withdrawal requests."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="read")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    return {"withdrawals": daraja_payment.get_all_pending_withdrawals()}


@admin_router.post("/withdrawals/{request_id}/approve")
async def approve_withdrawal(request_id: int, request: Request,
                              body: AdminWithdrawalAction = AdminWithdrawalAction(),
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Approve a withdrawal request."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = daraja_payment.approve_withdrawal(request_id, body.admin_notes)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Approval failed"))
    _log_action(auth, "approve_withdrawal", "withdrawals", request, "withdrawal", request_id, {"notes": body.admin_notes})
    return result


@admin_router.post("/withdrawals/{request_id}/reject")
async def reject_withdrawal(request_id: int, request: Request,
                             body: AdminWithdrawalAction = AdminWithdrawalAction(),
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Reject a withdrawal request and refund balance."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = daraja_payment.reject_withdrawal(request_id, body.admin_notes)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Rejection failed"))
    _log_action(auth, "reject_withdrawal", "withdrawals", request, "withdrawal", request_id, {"notes": body.admin_notes})
    return result


@admin_router.post("/withdrawals/{request_id}/complete")
async def complete_withdrawal_admin(request_id: int, request: Request,
                                     x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Mark withdrawal as completed."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = daraja_payment.complete_withdrawal(request_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Completion failed"))
    _log_action(auth, "complete_withdrawal", "withdrawals", request, "withdrawal", request_id)
    return result


@admin_router.post("/withdrawals/{request_id}/retry-whop")
async def retry_whop_transfer(request_id: int, request: Request,
                               x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Retry a failed Whop transfer for a withdrawal."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = daraja_payment.retry_whop_transfer(request_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Retry failed"))
    _log_action(auth, "retry_whop_transfer", "withdrawals", request, "withdrawal", request_id)
    return result


@admin_router.get("/withdrawal-options")
async def get_all_withdrawal_options(x_admin_password: str = Header(None),
                                      authorization: str = Header(None)):
    """Get all users' withdrawal methods with verification status."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="read")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    return {"options": daraja_payment.get_all_withdrawal_options()}


class B2CTestRequest(BaseModel):
    phone: str       # e.g. "254712345678"
    amount_kes: int  # small amount like 10

@admin_router.post("/b2c/test")
async def admin_test_b2c(request: Request, body: B2CTestRequest,
                          x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Test B2C payment with a small amount. Owner-only endpoint."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Owner access required")

    if body.amount_kes < 10 or body.amount_kes > 100:
        raise HTTPException(status_code=400, detail="Test amount must be between KES 10 and KES 100")

    phone = body.phone.strip()
    if not phone.startswith("254") or len(phone) != 12:
        raise HTTPException(status_code=400, detail="Phone must be in 254XXXXXXXXX format (12 digits)")

    # Create a temporary disbursement item for tracking
    conn = daraja_payment._get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO disbursement_items (batch_id, user_id, phone, amount_usd, amount_kes, exchange_rate, status, created_at)
        VALUES (0, 0, ?, ?, ?, 1, 'pending', ?)
    """, (phone, body.amount_kes, body.amount_kes, now))
    conn.commit()
    item_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    result = await daraja_payment.initiate_b2c_payment(
        phone=phone,
        amount_kes=body.amount_kes,
        disbursement_item_id=item_id,
        remarks="SparkAI B2C Test",
        occasion="Test"
    )

    _log_action(auth, "test_b2c", "withdrawals", request, "b2c_test", item_id,
                {"phone": f"254***{phone[-4:]}", "amount_kes": body.amount_kes, "success": result.get("success")})

    return {
        "success": result.get("success", False),
        "conversation_id": result.get("conversation_id", ""),
        "error": result.get("error", ""),
        "item_id": item_id,
        "note": "Check callback logs for final status. Money should arrive within 30 seconds if successful."
    }


# ═══════════════════════════════════════════════════════════
#  B2C DISBURSEMENTS (M-PESA PAYOUTS)
# ═══════════════════════════════════════════════════════════

class ApproveBatchRequest(BaseModel):
    admin_notes: str = ""


@admin_router.post("/disbursements/generate")
async def generate_disbursement_batch(request: Request,
                                       x_admin_password: str = Header(None),
                                       authorization: str = Header(None)):
    """Generate disbursement batch for eligible users (mpesa_phone + balance >= KES 1000)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="write")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await daraja_payment.generate_disbursement_batch()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Generation failed"))
    _log_action(auth, "generate_disbursement_batch", "withdrawals", request,
                "disbursement_batch", result.get("batch_id"),
                {"total_users": result.get("total_users")})
    return result


@admin_router.get("/disbursements/pending")
async def get_pending_disbursement(x_admin_password: str = Header(None),
                                    authorization: str = Header(None)):
    """Get the current pending/processing disbursement batch with items."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="read")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    return daraja_payment.get_pending_disbursement_batch()


@admin_router.post("/disbursements/{batch_id}/approve")
async def approve_disbursement_batch(batch_id: int, request: Request,
                                      body: ApproveBatchRequest = ApproveBatchRequest(),
                                      x_admin_password: str = Header(None),
                                      authorization: str = Header(None)):
    """Approve and trigger B2C M-Pesa payments for a disbursement batch."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Super admin access required")
    result = await daraja_payment.approve_and_execute_batch(
        batch_id, auth.get("user_id", 0), body.admin_notes)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Approval failed"))
    _log_action(auth, "approve_disbursement_batch", "withdrawals", request,
                "disbursement_batch", batch_id,
                {"sent": result.get("sent"), "failed": result.get("failed")})
    return result


@admin_router.post("/disbursements/{batch_id}/cancel")
async def cancel_disbursement_batch(batch_id: int, request: Request,
                                     x_admin_password: str = Header(None),
                                     authorization: str = Header(None)):
    """Cancel a pending batch (before approval)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = daraja_payment.cancel_disbursement_batch(batch_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Cancel failed"))
    _log_action(auth, "cancel_disbursement_batch", "withdrawals", request,
                "disbursement_batch", batch_id)
    return result


@admin_router.post("/disbursements/items/{item_id}/retry")
async def retry_disbursement_item(item_id: int, request: Request,
                                   x_admin_password: str = Header(None),
                                   authorization: str = Header(None)):
    """Retry a failed B2C disbursement for a single item."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Super admin access required")
    result = await daraja_payment.retry_disbursement_item(item_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Retry failed"))
    _log_action(auth, "retry_disbursement_item", "withdrawals", request,
                "disbursement_item", item_id)
    return result


@admin_router.get("/disbursements/history")
async def get_disbursement_history(limit: int = Query(20, ge=1, le=100),
                                    x_admin_password: str = Header(None),
                                    authorization: str = Header(None)):
    """Get past disbursement batches."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="read")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    return daraja_payment.get_disbursement_history(limit)


# ═══════════════════════════════════════════════════════════
#  BALANCE MANAGEMENT
# ═══════════════════════════════════════════════════════════

@admin_router.post("/users/{user_id}/adjust-balance")
async def admin_adjust_balance(user_id: int, request: Request, req: AdjustBalanceRequest,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Adjust a user's account balance."""
    admin = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                              required_module="users", required_action="edit")
    if not admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    if req.amount_usd == 0 and req.amount_kes == 0:
        raise HTTPException(status_code=400, detail="Amount must not be zero")

    profile = user_auth.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    updated = community.adjust_user_balance(
        user_id=user_id,
        amount_usd=req.amount_usd,
        amount_kes=req.amount_kes,
        reason=req.reason,
        adjustment_type=req.adjustment_type,
        adjusted_by_id=admin.get("user_id"),
        adjusted_by_name=admin.get("display_name", "Admin"),
    )

    # Send notification
    try:
        if req.amount_usd > 0:
            amt_str = f"${req.amount_usd:.2f}"
        elif req.amount_kes > 0:
            amt_str = f"KES {req.amount_kes:.0f}"
        elif req.amount_usd < 0:
            amt_str = f"${abs(req.amount_usd):.2f}"
        else:
            amt_str = f"KES {abs(req.amount_kes):.0f}"
        is_credit = req.amount_usd > 0 or req.amount_kes > 0
        notif_title = "Account Credited" if is_credit else "Account Debited"
        notif_msg = f"Your account has been credited with {amt_str}." if is_credit else f"{amt_str} has been debited from your account."
        if req.reason:
            notif_msg += f" Reason: {req.reason}"
        community.create_notification(
            user_id=user_id, notif_type="balance_adjustment",
            title=notif_title, message=notif_msg,
            metadata={"amount_usd": req.amount_usd, "amount_kes": req.amount_kes},
        )
    except Exception:
        pass

    _log_action(admin, "adjust_balance", "users", request, "user", user_id,
                {"amount_usd": req.amount_usd, "amount_kes": req.amount_kes, "reason": req.reason})
    return {"success": True, "balance": updated}


@admin_router.get("/users/{user_id}/balance-history")
async def admin_balance_history(user_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get balance adjustment history for a user."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'},
                             required_module="users", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"adjustments": community.get_balance_adjustments(user_id)}


# ═══════════════════════════════════════════════════════════
#  SUBSCRIPTIONS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/subscriptions")
async def admin_list_subscriptions(
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    """List all subscriptions AND pay-on-the-go topups, grouped by type."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'},
                             required_module="subscriptions", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Get subscriptions from users.db
    import subscriptions as subs_mod
    sconn = subs_mod._get_db()
    sub_rows = sconn.execute("""
        SELECT id, user_id, plan, price_amount, price_currency,
               status, payment_method, payment_ref, started_at,
               expires_at, created_at
        FROM subscriptions ORDER BY created_at DESC
    """).fetchall()
    sconn.close()

    # 2. Get pay-on-the-go topups from community.db (M-Pesa)
    conn = sqlite3.connect("community.db", timeout=10)
    conn.row_factory = sqlite3.Row
    mpesa_topups = conn.execute("""
        SELECT id, user_id, transaction_type, amount_kes, amount_usd,
               phone_number, mpesa_receipt, payment_status, created_at, completed_at
        FROM payment_transactions
        WHERE transaction_type = 'balance_topup' AND payment_status IN ('completed', 'confirmed')
        ORDER BY created_at DESC
    """).fetchall()

    # 3. Get pay-on-the-go topups from community.db (Whop/Card)
    whop_topups = conn.execute("""
        SELECT id, user_id, transaction_type, amount_usd,
               whop_payment_id, payment_status, created_at, completed_at
        FROM whop_transactions
        WHERE transaction_type = 'balance_topup' AND payment_status = 'completed'
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()

    # Collect all user IDs
    all_user_ids = set()
    for r in sub_rows:
        all_user_ids.add(r["user_id"])
    for r in mpesa_topups:
        all_user_ids.add(r["user_id"])
    for r in whop_topups:
        all_user_ids.add(r["user_id"])
    all_user_ids = list(all_user_ids)

    # Batch fetch user details
    user_map = {}
    balance_map = {}
    if all_user_ids:
        uconn = user_auth._get_db()
        ph = ",".join("?" * len(all_user_ids))
        user_rows = uconn.execute(
            f"SELECT id, display_name, username, email, avatar_color, tier FROM users WHERE id IN ({ph})", all_user_ids
        ).fetchall()
        uconn.close()
        user_map = {r["id"]: dict(r) for r in user_rows}

        bconn = sqlite3.connect("community.db", timeout=10)
        bconn.row_factory = sqlite3.Row
        bal_rows = bconn.execute(
            f"SELECT user_id, balance_usd, balance_kes, total_deposited_usd, total_deposited_kes FROM user_balances WHERE user_id IN ({ph})", all_user_ids
        ).fetchall()
        bconn.close()
        balance_map = {r["user_id"]: dict(r) for r in bal_rows}

    now = datetime.now()

    def _enrich_user(uid):
        user = user_map.get(uid, {})
        bal = balance_map.get(uid, {})
        return {
            "display_name": user.get("display_name", "Unknown"),
            "username": user.get("username", ""),
            "email": user.get("email", ""),
            "avatar_color": user.get("avatar_color", "#6c5ce7"),
            "tier": user.get("tier", "free"),
            "balance_usd": bal.get("balance_usd", 0),
            "balance_kes": bal.get("balance_kes", 0),
            "total_deposited_usd": bal.get("total_deposited_usd", 0),
            "total_deposited_kes": bal.get("total_deposited_kes", 0),
        }

    # Build subscriptions list
    subscriptions_list = []
    for s in sub_rows:
        d = dict(s)
        days_remaining = 0
        try:
            expires = datetime.fromisoformat(d["expires_at"])
            days_remaining = max(0, (expires - now).days)
        except Exception:
            pass
        d["days_remaining"] = days_remaining
        d.update(_enrich_user(d["user_id"]))
        subscriptions_list.append(d)

    # Build pay-on-the-go list (M-Pesa)
    payg_list = []
    for t in mpesa_topups:
        d = dict(t)
        d["source"] = "mpesa"
        d["payment_method"] = "M-Pesa"
        d.update(_enrich_user(d["user_id"]))
        payg_list.append(d)

    # Build pay-on-the-go list (Whop/Card)
    for t in whop_topups:
        d = dict(t)
        d["source"] = "whop"
        d["payment_method"] = "Card"
        d["amount_kes"] = 0
        d.update(_enrich_user(d["user_id"]))
        payg_list.append(d)

    # Sort payg by created_at desc
    payg_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Group subscriptions by plan type
    weekly = [s for s in subscriptions_list if "weekly" in (s.get("plan") or "").lower()]
    monthly = [s for s in subscriptions_list if "monthly" in (s.get("plan") or "").lower()]
    # Trial and pro go into weekly (they are short-term subs)
    trial_and_other = [s for s in subscriptions_list if s not in weekly and s not in monthly]
    weekly = trial_and_other + weekly  # trials + weekly together

    active_subs = [s for s in subscriptions_list if s.get("status") == "active"]

    return {
        "subscriptions": subscriptions_list,
        "users": subscriptions_list,
        "pay_on_the_go": payg_list,
        "weekly": weekly,
        "monthly": monthly,
        "stats": {
            "total_subscriptions": len(subscriptions_list),
            "active_subscriptions": len(active_subs),
            "total_topups": len(payg_list),
            "weekly_count": len(weekly),
            "monthly_count": len(monthly),
        },
    }


# ═══════════════════════════════════════════════════════════
#  BROADCAST MESSAGING
# ═══════════════════════════════════════════════════════════

@admin_router.post("/broadcast")
async def admin_create_broadcast(request: Request, body: BroadcastRequest,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a broadcast message. Super admin sends immediately; customer care needs approval."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod', 'customer_support_agent'},
                             required_module="community", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not body.title.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Title and message are required")

    if body.target_type == "specific" and (not body.target_user_ids or len(body.target_user_ids) == 0):
        raise HTTPException(status_code=400, detail="At least one target user is required")

    # Super admin (level 0 owner or legacy password) auto-approves
    is_super = auth.get("role_level", 99) <= 1 or auth.get("is_admin")
    result = community.create_broadcast(
        sender_id=auth.get("user_id") or 0,
        sender_name=auth.get("display_name", "Admin"),
        title=body.title.strip(),
        message=body.message.strip(),
        auto_approve=is_super,
        channel=body.channel,
        target_type=body.target_type,
        target_user_ids=body.target_user_ids,
        target_user_names=body.target_user_names,
    )
    _log_action(auth, "create_broadcast", "community", request, "broadcast", result.get("broadcast_id"),
                {"title": body.title, "auto_approved": is_super})
    return result


@admin_router.get("/broadcasts")
async def admin_list_broadcasts(status: str = None,
                                 x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List broadcast messages, optionally filtered by status."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod', 'customer_support_agent'},
                             required_module="community", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"broadcasts": community.get_broadcasts(status_filter=status)}


@admin_router.post("/broadcast/{broadcast_id}/approve")
async def admin_approve_broadcast(broadcast_id: int, request: Request,
                                   x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Super admin approves a pending broadcast and sends it to all users."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="community", required_action="approve")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.approve_broadcast(broadcast_id, auth.get("user_id", 0), auth.get("display_name", "Admin"))
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    _log_action(auth, "approve_broadcast", "community", request, "broadcast", broadcast_id)
    return result


@admin_router.post("/broadcast/{broadcast_id}/reject")
async def admin_reject_broadcast(broadcast_id: int, request: Request, body: RejectBroadcastRequest,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Super admin rejects a pending broadcast."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="community", required_action="approve")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.reject_broadcast(broadcast_id, auth.get("user_id", 0),
                                         auth.get("display_name", "Admin"), body.reason)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    _log_action(auth, "reject_broadcast", "community", request, "broadcast", broadcast_id,
                {"reason": body.reason})
    return result


class UpdateBroadcastRequest(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None

class GenerateReengagementRequest(BaseModel):
    template_index: Optional[int] = None


@admin_router.put("/broadcast/{broadcast_id}")
async def admin_update_broadcast(broadcast_id: int, request: Request, body: UpdateBroadcastRequest,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Edit a pending broadcast's title or message before approval."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="community", required_action="approve")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.update_broadcast(broadcast_id, title=body.title, message=body.message)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    _log_action(auth, "update_broadcast", "community", request, "broadcast", broadcast_id)
    return result


# ═══════════════════════════════════════════════════════════
#  RE-ENGAGEMENT TEMPLATES
# ═══════════════════════════════════════════════════════════

@admin_router.get("/reengagement/templates")
async def get_reengagement_templates(
    x_admin_password: str = Header(None), authorization: str = Header(None)
):
    """Get all re-engagement email template metadata and inactive user count."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod', 'customer_support_agent'},
                             required_module="community", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    import reengagement
    templates = [{"index": i, **meta} for i, meta in enumerate(reengagement.TEMPLATE_META)]
    inactive_count = len(user_auth.get_inactive_users(days=2))
    return {"templates": templates, "inactive_user_count": inactive_count}


@admin_router.get("/reengagement/preview/{template_index}")
async def preview_reengagement_template(
    template_index: int,
    x_admin_password: str = Header(None), authorization: str = Header(None)
):
    """Render a specific re-engagement template with real match data for preview."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod', 'customer_support_agent'},
                             required_module="community", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    import reengagement
    if template_index < 0 or template_index >= len(reengagement.ALL_TEMPLATES):
        raise HTTPException(status_code=400, detail="Invalid template index")
    matches = await reengagement.get_big_league_fixtures(days=3)
    template_fn = reengagement.ALL_TEMPLATES[template_index]
    result = template_fn("John", matches)
    match_summaries = [
        {"league": m.get("competition", {}).get("name", ""), "home": m.get("home_team", {}).get("name", ""),
         "away": m.get("away_team", {}).get("name", ""), "kickoff": reengagement._format_kickoff(m.get("date", ""))}
        for m in matches[:3]
    ]
    meta = reengagement.TEMPLATE_META[template_index]
    return {"index": template_index, "name": meta["name"], "subject": result["subject"],
            "html_body": result["html_body"], "match_count": len(matches), "matches": match_summaries}


@admin_router.post("/reengagement/generate")
async def generate_reengagement(
    request: Request, body: GenerateReengagementRequest,
    x_admin_password: str = Header(None), authorization: str = Header(None)
):
    """Manually trigger re-engagement broadcast generation."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="community", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    import reengagement
    import random as _rand
    # Check for existing pending
    existing = community.get_broadcasts(status_filter="pending_approval", limit=50)
    for b in existing:
        if b.get("target_type") == "inactive":
            return {"success": False, "error": "A pending re-engagement broadcast already exists. Approve or reject it first."}
    inactive_users = user_auth.get_inactive_users(days=2)
    if not inactive_users:
        return {"success": False, "error": "No inactive users found."}
    matches = await reengagement.get_big_league_fixtures(days=3)
    if not matches:
        return {"success": False, "error": "No big-league fixtures found in next 3 days."}
    # Pick template
    if body.template_index is not None:
        if body.template_index < 0 or body.template_index >= len(reengagement.ALL_TEMPLATES):
            raise HTTPException(status_code=400, detail="Invalid template index")
        template_fn = reengagement.ALL_TEMPLATES[body.template_index]
        template_idx = body.template_index
    else:
        template_fn = _rand.choice(reengagement.ALL_TEMPLATES)
        template_idx = reengagement.ALL_TEMPLATES.index(template_fn)
    result = template_fn("there", matches)
    match_summary_lines = []
    for m in matches[:3]:
        league = m.get("competition", {}).get("name", "")
        home = m.get("home_team", {}).get("name", "")
        away = m.get("away_team", {}).get("name", "")
        kickoff = reengagement._format_kickoff(m.get("date", ""))
        match_summary_lines.append(f"{league}: {home} vs {away} ({kickoff})")
    broadcast_result = community.create_broadcast(
        sender_id=auth.get("user_id") or 0,
        sender_name=auth.get("display_name", "Admin"),
        title=result["subject"],
        message=f"[TEMPLATE:{template_idx}]\n---\nFeatured Matches:\n" + "\n".join(match_summary_lines) + f"\n---\nInactive users: {len(inactive_users)}",
        auto_approve=False, channel="email", target_type="inactive",
    )
    meta = reengagement.TEMPLATE_META[template_idx]
    _log_action(auth, "generate_reengagement", "community", request, "broadcast",
                broadcast_result.get("broadcast_id"), {"template": meta["name"]})
    return {"success": True, "broadcast_id": broadcast_result.get("broadcast_id"),
            "template_name": meta["name"], "inactive_user_count": len(inactive_users), "match_count": len(matches[:3])}


# ═══════════════════════════════════════════════════════════
#  CHAT KEEP-ALIVE
# ═══════════════════════════════════════════════════════════

@admin_router.get("/support/keepalive-prompts")
async def admin_get_keepalive_prompts(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get pending keep-alive prompts for the current agent."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod',
                              'customer_support_agent', 'technical_support'},
                             required_module="support", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    agent_id = auth.get("user_id")
    if not agent_id:
        return {"prompts": []}
    return {"prompts": community.get_pending_keepalive_for_agent(agent_id)}


@admin_router.post("/support/keepalive/{conversation_id}")
async def admin_respond_keepalive(conversation_id: int, request: Request,
                                   keep_open: bool = True,
                                   x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Respond to a keep-alive prompt: keep chat open or close it."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             {'super_admin', 'customer_care', 'customer_care_hod',
                              'customer_support_agent', 'technical_support'},
                             required_module="support", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    agent_id = auth.get("user_id")
    result = community.respond_keepalive(conversation_id, agent_id, keep_open)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))

    # If agent chose to close, close the conversation
    if not keep_open:
        # Find the user_id for this conversation
        conn = community._get_db()
        conv = conn.execute("SELECT user_id FROM support_conversations WHERE id = ?", (conversation_id,)).fetchone()
        conn.close()
        if conv:
            community.send_support_message(
                conv["user_id"], "system",
                "This conversation has been closed. You can start a new conversation anytime."
            )
            community.close_conversation(conv["user_id"], "agent_closed")

    _log_action(auth, "keepalive_response", "support", request, "conversation", conversation_id,
                {"keep_open": keep_open})
    return result


# ═══════════════════════════════════════════════════════════
#  BOT ACCOUNTS
# ═══════════════════════════════════════════════════════════

@admin_router.get("/bots")
async def admin_list_bots(page: int = 1, assigned_to: int = None, is_active: int = None,
                          search: str = None,
                          x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all bot accounts."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return bot_manager.get_all_bots(page=page, assigned_to=assigned_to, is_active=is_active, search=search)


@admin_router.get("/bots/stats")
async def admin_bot_stats(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get bot summary stats."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return bot_manager.get_bot_stats()


@admin_router.post("/bots/create")
async def admin_create_bots(request: Request, body: CreateBotsRequest,
                            x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create bot accounts in bulk."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.create_bots(body.count, body.name_prefix)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "create_bots", "bots", request, details={"count": body.count})
    return result


@admin_router.post("/bots/activate")
async def admin_activate_bots(request: Request, body: BotIdsRequest,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Activate specific bots."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.activate_bots(body.bot_ids)
    _log_action(auth, "activate_bots", "bots", request, details={"count": len(body.bot_ids)})
    return result


@admin_router.post("/bots/deactivate")
async def admin_deactivate_bots(request: Request, body: BotIdsRequest,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Deactivate specific bots."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.deactivate_bots(body.bot_ids)
    _log_action(auth, "deactivate_bots", "bots", request, details={"count": len(body.bot_ids)})
    return result


@admin_router.post("/bots/activate-all")
async def admin_activate_all_bots(request: Request,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Activate all bots."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.activate_bots(all_bots=True)
    _log_action(auth, "activate_all_bots", "bots", request)
    return result


@admin_router.post("/bots/deactivate-all")
async def admin_deactivate_all_bots(request: Request,
                                    x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Deactivate all bots."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.deactivate_bots(all_bots=True)
    _log_action(auth, "deactivate_all_bots", "bots", request)
    return result


@admin_router.post("/bots/assign")
async def admin_assign_bots(request: Request, body: AssignBotsRequest,
                            x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Assign bots to an employee."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.assign_bots_to_employee(body.bot_ids, body.employee_user_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "assign_bots", "bots", request, "user", body.employee_user_id,
                {"count": len(body.bot_ids)})
    return result


@admin_router.post("/bots/unassign")
async def admin_unassign_bots(request: Request, body: BotIdsRequest,
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Remove employee assignment from bots."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.unassign_bots(body.bot_ids)
    _log_action(auth, "unassign_bots", "bots", request, details={"count": len(body.bot_ids)})
    return result


@admin_router.post("/bots/delete")
async def admin_delete_bots(request: Request, body: BotIdsRequest,
                            x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Permanently delete bot accounts."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.delete_bots(body.bot_ids)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    _log_action(auth, "delete_bots", "bots", request, details={"count": len(body.bot_ids)})
    return result


@admin_router.post("/bots/action")
async def admin_bot_action(request: Request, body: BotActionRequest,
                           x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Make a bot perform an action (admin can control any bot)."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.execute_bot_action(body.bot_id, body.action, body.target_id, body.message, body.reaction)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Bot action failed"))
    return result


@admin_router.post("/bots/batch-action")
async def admin_bot_batch_action(request: Request, body: BotBatchActionRequest,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Make multiple bots perform the same action."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.execute_batch_action(body.bot_ids, body.action, body.target_id, body.message, body.reaction)
    _log_action(auth, "bot_batch_action", "bots", request, details={"action": body.action, "count": len(body.bot_ids)})
    return result


@admin_router.get("/bots/users-search")
async def admin_bots_user_search(search: str = "", limit: int = 20,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Search real users for bot targeting."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"users": bot_manager.get_real_users(search, limit)}


@admin_router.get("/bots/live-matches")
async def admin_bots_live_matches(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get live matches for bot chat targeting."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    import football_api
    live_matches = await football_api.fetch_live_matches() or []
    todays = await football_api.fetch_todays_fixtures() or []
    # Merge in today's scheduled/upcoming matches (not finished ones)
    finished_statuses = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"}
    live_ids = {m["id"] for m in live_matches}
    for match in todays:
        if match["id"] not in live_ids and match.get("status") not in finished_statuses:
            live_matches.append(match)
    # Filter out finished matches from live list too
    live_matches = [m for m in live_matches if m.get("status") not in finished_statuses]
    # Return simplified match data
    matches = []
    for m in live_matches:
        home = m.get("home_team", {})
        away = m.get("away_team", {})
        matches.append({
            "id": m.get("id"),
            "match_key": str(m.get("id")),
            "home_team": home.get("name", "Unknown"),
            "away_team": away.get("name", "Unknown"),
            "home_team_id": home.get("id"),
            "away_team_id": away.get("id"),
            "home_logo": home.get("logo", ""),
            "away_logo": away.get("logo", ""),
            "score": f"{m.get('home_score', 0)}-{m.get('away_score', 0)}",
            "status": m.get("status", "NS"),
            "minute": m.get("minute", ""),
            "league": m.get("league", {}).get("name", ""),
            "league_code": m.get("league", {}).get("code") or m.get("competition", {}).get("code", ""),
        })
    # Sort: live first, then scheduled
    live_statuses = {"1H", "2H", "HT", "ET", "LIVE"}
    matches.sort(key=lambda x: (0 if x["status"] in live_statuses else 1, x["league"]))
    return {"matches": matches, "count": len(matches)}


@admin_router.get("/bots/predictions")
async def admin_bots_predictions(page: int = 1, search: str = "",
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get community predictions for bot interaction."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return bot_manager.get_predictions_for_bots(page=page, search=search)


# ── Staggered Queue ──

@admin_router.post("/bots/staggered-batch")
async def admin_bot_staggered_batch(request: Request, body: BotStaggeredBatchRequest,
                                     x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Enqueue a staggered batch of bot actions with random delays."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.enqueue_staggered_batch(
        body.bot_ids, body.action, body.target_id, body.message, body.reaction,
        body.delay_min, body.delay_max, body.messages_list or None
    )
    _log_action(auth, "bot_staggered_batch", "bots", request,
                details={"action": body.action, "count": len(body.bot_ids), "batch_id": result.get("batch_id")})
    return result


@admin_router.get("/bots/queue-status/{batch_id}")
async def admin_bot_queue_status(batch_id: str,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get current progress of a staggered queue batch."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return bot_manager.get_queue_status(batch_id)


@admin_router.post("/bots/queue-cancel/{batch_id}")
async def admin_bot_queue_cancel(batch_id: str, request: Request,
                                  x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Cancel a running staggered queue batch."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.cancel_queue(batch_id)
    _log_action(auth, "bot_cancel_queue", "bots", request, details={"batch_id": batch_id})
    return result


@admin_router.get("/bots/active-queues")
async def admin_bot_active_queues(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all active/recent staggered queue batches."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"queues": bot_manager.get_active_queues()}


# ── Bot Prediction Creation ──

@admin_router.post("/bots/create-prediction")
async def admin_bot_create_prediction(request: Request, body: BotCreatePredictionRequest,
                                       x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a community prediction as a bot."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = bot_manager.create_bot_prediction(
        body.bot_id, body.fixture_id, body.team_a_name, body.team_b_name,
        body.competition, body.predicted_result, body.analysis_summary,
        body.predicted_over25, body.predicted_btts, body.odds
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    _log_action(auth, "bot_create_prediction", "bots", request,
                details={"bot_id": body.bot_id, "match": f"{body.team_a_name} vs {body.team_b_name}"})
    return result


@admin_router.post("/bots/batch-create-prediction")
async def admin_bot_batch_create_prediction(request: Request, body: BotBatchCreatePredictionRequest,
                                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Have multiple bots create predictions for the same match, optionally staggered."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    successes = 0
    failures = 0
    for i, bid in enumerate(body.bot_ids):
        pred = body.predictions[i % len(body.predictions)] if body.predictions else {}
        result = bot_manager.create_bot_prediction(
            bid, body.fixture_id, body.team_a_name, body.team_b_name,
            body.competition,
            pred.get("predicted_result", ""),
            pred.get("analysis_summary", ""),
            pred.get("predicted_over25"),
            pred.get("predicted_btts"),
            pred.get("odds"),
        )
        if result.get("success"):
            successes += 1
        else:
            failures += 1

    _log_action(auth, "bot_batch_create_prediction", "bots", request,
                details={"count": len(body.bot_ids), "match": f"{body.team_a_name} vs {body.team_b_name}"})
    return {"success": True, "total": len(body.bot_ids), "successes": successes, "failures": failures}


# ── Chat Activity Monitoring ──

@admin_router.get("/bots/chat-activity")
async def admin_bot_chat_activity(match_key: str = None, since_minutes: int = 60, limit: int = 100,
                                   x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get bot chat conversations with reply detection for monitoring."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    match_keys = [match_key] if match_key else None
    return bot_manager.get_bot_chat_activity(match_keys=match_keys, limit=limit, since_minutes=since_minutes)


@admin_router.get("/bots/match-chat/{match_key}")
async def admin_bot_match_chat(match_key: str, since_id: int = 0,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get live match chat messages for the embedded chat viewer."""
    auth = _check_admin_auth(x_admin_password, authorization, required_module="bots", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    messages = community.get_match_chat_messages(match_key, since_id=since_id, limit=100)
    return {"messages": messages}


# ═══════════════════════════════════════════════════════════
#  PRICING CONFIGURATION
# ═══════════════════════════════════════════════════════════

@admin_router.get("/pricing")
async def admin_get_pricing(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get all pricing configuration (super_admin only)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="settings", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {
        "configs": pricing_config.get_all_raw(),
        "categories": ["subscription_plans", "commissions", "pay_per_use", "free_tier"],
    }


@admin_router.put("/pricing")
async def admin_update_pricing(request: Request, body: UpdatePricingConfigRequest,
                                x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Update pricing configuration values (super_admin only)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="settings", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = pricing_config.bulk_update(body.updates, updated_by=auth.get("display_name", "Admin"))
    _log_action(auth, "update_pricing", "settings", request,
                details={"keys": list(body.updates.keys())})
    return result


@admin_router.post("/pricing/plans")
async def admin_create_plan(request: Request, body: CreatePlanRequest,
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Create a new subscription plan (super_admin only)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="settings", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    by = auth.get("display_name", "Admin")
    plan_id = body.plan_id.strip().lower().replace(" ", "_")

    # Create config entries for the new plan
    for key, val, vtype in [
        (f"plan_{plan_id}_price", body.price, "number"),
        (f"plan_{plan_id}_duration", body.duration_days, "number"),
        (f"plan_{plan_id}_name", body.name, "string"),
        (f"plan_{plan_id}_currency", body.currency, "string"),
        (f"plan_{plan_id}_features", body.features, "json"),
    ]:
        res = pricing_config.create_config(key, val, "subscription_plans",
                                            label=f"{body.name} - {key.split('_')[-1].title()}",
                                            value_type=vtype, updated_by=by)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Failed to create plan config"))

    # Add to plans_list
    plans_list = pricing_config.get("plans_list", [])
    if plan_id not in plans_list:
        plans_list.append(plan_id)
        pricing_config.update("plans_list", plans_list, by)

    _log_action(auth, "create_plan", "settings", request,
                details={"plan_id": plan_id, "name": body.name, "price": body.price, "currency": body.currency})
    return {"success": True, "plan_id": plan_id}


@admin_router.delete("/pricing/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, request: Request,
                             x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Remove a subscription plan (super_admin only)."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'},
                             required_module="settings", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    by = auth.get("display_name", "Admin")

    # Remove from plans_list
    plans_list = pricing_config.get("plans_list", [])
    if plan_id in plans_list:
        plans_list.remove(plan_id)
        pricing_config.update("plans_list", plans_list, by)

    # Delete config entries
    for suffix in ["_price", "_duration", "_name", "_currency", "_features"]:
        pricing_config.delete_config(f"plan_{plan_id}{suffix}")

    _log_action(auth, "delete_plan", "settings", request, details={"plan_id": plan_id})
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
#  SOCIAL MEDIA HUB ENDPOINTS
# ═══════════════════════════════════════════════════════════════

SOCIAL_MEDIA_UPLOAD_DIR = Path(__file__).parent / "uploads" / "social"
MAX_SOCIAL_MEDIA_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_SOCIAL_MEDIA_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi",
    ".pdf", ".doc", ".docx", ".txt", ".mp3", ".ogg", ".wav",
}


# ─── Account Management ───

@admin_router.get("/social/accounts")
async def social_list_accounts(
    platform: str = Query(None),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"accounts": social_media_hub.get_accounts(platform)}


@admin_router.post("/social/accounts/connect")
async def social_connect_account(
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    platform = body.get("platform", "")
    account_name = body.get("account_name", "")
    credentials = body.get("credentials", {})

    if not platform or not account_name:
        raise HTTPException(status_code=400, detail="Platform and account name are required")

    import secrets
    webhook_secret = secrets.token_hex(32)
    webhook_base = os.environ.get("WEBHOOK_BASE_URL", "https://spark-ai-prediction.com")
    webhook_url = f"{webhook_base}/api/webhook/social/{platform}/{{}}"

    # Verify credentials with the platform
    if platform == "telegram":
        from telegram_service import TelegramService
        bot_token = credentials.get("bot_token", "")
        if not bot_token:
            raise HTTPException(status_code=400, detail="Bot token is required for Telegram")

        service = TelegramService(bot_token, webhook_base)
        me_result = await service.get_me()
        if not me_result.get("ok"):
            raise HTTPException(status_code=400,
                                detail=f"Invalid bot token: {me_result.get('description', 'Unknown error')}")

        bot_info = me_result["result"]
        account_identifier = f"@{bot_info.get('username', '')}"
        if not account_name:
            account_name = bot_info.get("first_name", "Telegram Bot")

        # Create account first to get ID
        account = social_media_hub.create_account(
            platform="telegram",
            account_name=account_name,
            account_identifier=account_identifier,
            credentials=credentials,
            webhook_url="",
            webhook_secret=webhook_secret,
            config={"bot_id": bot_info.get("id"), "bot_username": bot_info.get("username")},
            connected_by=auth.get("user_id"),
        )

        # Register webhook with Telegram
        wh_result = await service.set_webhook(account["id"], webhook_secret)
        if wh_result.get("ok"):
            real_webhook_url = f"{webhook_base}/api/webhook/social/telegram/{account['id']}"
            conn = social_media_hub._get_db()
            conn.execute("UPDATE social_accounts SET webhook_url = ? WHERE id = ?",
                        (real_webhook_url, account["id"]))
            conn.commit()
            conn.close()
        else:
            social_media_hub.update_account_status(account["id"], "error",
                                                    f"Webhook registration failed: {wh_result.get('description', '')}")

        _log_action(auth, "connect_social_account", "social_media", request,
                    details={"platform": "telegram", "account": account_identifier})
        return {"success": True, "account": account, "bot_info": bot_info}

    elif platform == "whatsapp":
        account_sid = credentials.get("account_sid", "")
        auth_token = credentials.get("auth_token", "")
        from_number = credentials.get("from_number", "")

        if not all([account_sid, auth_token, from_number]):
            raise HTTPException(status_code=400,
                                detail="Account SID, Auth Token, and From Number are required for WhatsApp")

        account = social_media_hub.create_account(
            platform="whatsapp",
            account_name=account_name,
            account_identifier=from_number,
            credentials=credentials,
            webhook_url="",
            webhook_secret=webhook_secret,
            connected_by=auth.get("user_id"),
        )

        real_webhook_url = f"{webhook_base}/api/webhook/social/whatsapp/{account['id']}"
        conn = social_media_hub._get_db()
        conn.execute("UPDATE social_accounts SET webhook_url = ? WHERE id = ?",
                    (real_webhook_url, account["id"]))
        conn.commit()
        conn.close()

        _log_action(auth, "connect_social_account", "social_media", request,
                    details={"platform": "whatsapp", "account": from_number})
        return {
            "success": True,
            "account": account,
            "webhook_url": real_webhook_url,
            "instructions": "Set this URL as the 'When a message comes in' webhook in your Twilio console."
        }

    else:
        raise HTTPException(status_code=400, detail=f"Platform '{platform}' is not yet supported. Coming soon!")


@admin_router.post("/social/accounts/{account_id}/disconnect")
async def social_disconnect_account(
    account_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    account = social_media_hub.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Remove webhook from platform
    if account["platform"] == "telegram":
        try:
            from telegram_service import TelegramService
            creds = account.get("credentials", {})
            service = TelegramService(creds.get("bot_token", ""), "")
            await service.delete_webhook()
        except Exception:
            pass

    social_media_hub.delete_account(account_id)
    _log_action(auth, "disconnect_social_account", "social_media", request,
                details={"platform": account["platform"], "account_id": account_id})
    return {"success": True}


@admin_router.get("/social/accounts/{account_id}/status")
async def social_account_status(
    account_id: int,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    account = social_media_hub.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    live_status = {"status": account["status"], "error": account.get("error_message", "")}

    if account["platform"] == "telegram" and account["status"] == "connected":
        try:
            from telegram_service import TelegramService
            creds = account.get("credentials", {})
            service = TelegramService(creds.get("bot_token", ""), "")
            me = await service.get_me()
            live_status["live"] = me.get("ok", False)
        except Exception:
            live_status["live"] = False

    return live_status


# ─── Account Channels/Groups ───

@admin_router.get("/social/accounts/{account_id}/channels")
async def social_account_channels(
    account_id: int,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    channels = social_media_hub.get_account_channels(account_id)
    return {"channels": channels}


# ─── Conversations ───

@admin_router.get("/social/conversations")
async def social_list_conversations(
    platform: str = Query(None),
    assigned_to: int = Query(None),
    search: str = Query(None),
    is_archived: bool = Query(False),
    offset: int = Query(0),
    limit: int = Query(50),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return social_media_hub.get_conversations(platform, assigned_to, is_archived, search, offset, limit)


@admin_router.get("/social/conversations/{conv_id}/messages")
async def social_get_messages(
    conv_id: str,
    before_id: int = Query(None),
    limit: int = Query(50),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"messages": social_media_hub.get_messages(conv_id, before_id, limit)}


@admin_router.post("/social/conversations/{conv_id}/send")
async def social_send_message(
    conv_id: str,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conv = social_media_hub.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    body = await request.json()
    content_text = body.get("content_text", "")
    content_type = body.get("content_type", "text")
    media_url = body.get("media_url", "")

    if not content_text and not media_url:
        raise HTTPException(status_code=400, detail="Message content is required")

    account = social_media_hub.get_account(conv["account_id"])
    if not account or account["status"] != "connected":
        raise HTTPException(status_code=400, detail="Social media account is not connected")

    # Convert relative media URLs to absolute for platform APIs
    full_media_url = media_url
    if media_url and media_url.startswith("/"):
        base = os.environ.get("WEBHOOK_BASE_URL", "https://spark-ai-prediction.com")
        full_media_url = f"{base}{media_url}"

    platform_msg_id = ""
    delivery_status = "pending"

    try:
        if conv["platform"] == "telegram":
            from telegram_service import TelegramService
            creds = account.get("credentials", {})
            service = TelegramService(creds.get("bot_token", ""), "")

            if full_media_url and content_type == "gif":
                result = await service.send_animation(conv["contact_identifier"], full_media_url, content_text)
            elif full_media_url and content_type == "image":
                result = await service.send_photo(conv["contact_identifier"], full_media_url, content_text)
            elif full_media_url and content_type == "video":
                result = await service.send_video(conv["contact_identifier"], full_media_url, content_text)
            elif full_media_url and content_type == "audio":
                result = await service.send_document(conv["contact_identifier"], full_media_url, content_text)
            elif full_media_url:
                result = await service.send_document(conv["contact_identifier"], full_media_url, content_text)
            else:
                result = await service.send_message(conv["contact_identifier"], content_text)

            if result.get("ok"):
                platform_msg_id = str(result.get("result", {}).get("message_id", ""))
                delivery_status = "sent"
            else:
                delivery_status = "failed"

        elif conv["platform"] == "whatsapp":
            from whatsapp_social_service import WhatsAppSocialService
            creds = account.get("credentials", {})
            service = WhatsAppSocialService(
                creds.get("account_sid", ""),
                creds.get("auth_token", ""),
                creds.get("from_number", ""),
            )

            if full_media_url:
                result = await service.send_media(conv["contact_identifier"], full_media_url, content_text)
            else:
                result = await service.send_message(conv["contact_identifier"], content_text)

            if result.get("ok"):
                platform_msg_id = result.get("sid", "")
                delivery_status = "sent"
            else:
                delivery_status = "failed"

        elif conv["platform"] == "whatsapp_qr":
            import aiohttp
            wa_url = "http://127.0.0.1:3002"
            try:
                async with aiohttp.ClientSession() as session:
                    if full_media_url:
                        payload = {"to": conv["contact_identifier"], "url": full_media_url,
                                   "caption": content_text}
                        async with session.post(f"{wa_url}/send-media", json=payload,
                                                timeout=aiohttp.ClientTimeout(total=30)) as resp:
                            result = await resp.json()
                    else:
                        payload = {"to": conv["contact_identifier"], "text": content_text}
                        async with session.post(f"{wa_url}/send", json=payload,
                                                timeout=aiohttp.ClientTimeout(total=30)) as resp:
                            result = await resp.json()
                if result.get("ok"):
                    platform_msg_id = result.get("message_id", "")
                    delivery_status = "sent"
                else:
                    delivery_status = "failed"
            except Exception as e:
                delivery_status = "failed"

    except Exception as e:
        delivery_status = "failed"

    msg = social_media_hub.store_outbound_message(
        conv_id=conv_id,
        platform=conv["platform"],
        content_text=content_text,
        content_type=content_type,
        media_url=media_url,
        platform_message_id=platform_msg_id,
        sent_by_user_id=auth.get("user_id"),
        sent_by_name=auth.get("display_name", "Staff"),
        delivery_status=delivery_status,
    )

    social_media_hub.notify_social_inbox({
        "type": "outbound",
        "message": msg,
        "conversation_id": conv_id,
    })

    return {"success": True, "message": msg}


@admin_router.post("/social/conversations/{conv_id}/assign")
async def social_assign_conversation(
    conv_id: str,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    employee_id = body.get("employee_id")
    employee_name = body.get("employee_name", "")
    social_media_hub.assign_conversation(conv_id, employee_id, employee_name)
    return {"success": True}


@admin_router.post("/social/conversations/{conv_id}/read")
async def social_mark_read(
    conv_id: str,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    social_media_hub.mark_conversation_read(conv_id)
    return {"success": True}


@admin_router.post("/social/conversations/{conv_id}/archive")
async def social_archive_conversation(
    conv_id: str,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    social_media_hub.archive_conversation(conv_id)
    return {"success": True}


# ─── Message Search ───

@admin_router.get("/social/messages/search")
async def social_search_messages(
    q: str = Query(...),
    platform: str = Query(None),
    limit: int = Query(50),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"messages": social_media_hub.search_messages(q, platform, limit)}


# ─── Content Publishing ───

@admin_router.get("/social/posts")
async def social_list_posts(
    status: str = Query(None),
    offset: int = Query(0),
    limit: int = Query(20),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return social_media_hub.get_posts(status, offset, limit)


@admin_router.post("/social/posts")
async def social_create_post(
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    post = social_media_hub.create_post(
        title=body.get("title", ""),
        content_text=body.get("content_text", ""),
        media_urls=body.get("media_urls", []),
        target_platforms=body.get("target_platforms", []),
        scheduled_at=body.get("scheduled_at"),
        created_by_user_id=auth.get("user_id"),
        created_by_name=auth.get("display_name", "Staff"),
    )
    _log_action(auth, "create_social_post", "social_media", request, details={"post_id": post["id"]})
    return {"success": True, "post": post}


@admin_router.post("/social/posts/{post_id}/publish")
async def social_publish_post(
    post_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    results = await social_media_hub._publish_post(post_id)
    _log_action(auth, "publish_social_post", "social_media", request,
                details={"post_id": post_id, "results": results})
    return {"success": True, "results": results}


@admin_router.put("/social/posts/{post_id}")
async def social_update_post(
    post_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    social_media_hub.update_post(post_id, **body)
    return {"success": True}


@admin_router.delete("/social/posts/{post_id}")
async def social_delete_post(
    post_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    social_media_hub.delete_post(post_id)
    return {"success": True}


# ─── Media Upload ───

@admin_router.post("/social/media/upload")
async def social_upload_media(
    file: UploadFile = File(...),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_SOCIAL_MEDIA_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} is not allowed")

    content = await file.read()
    if len(content) > MAX_SOCIAL_MEDIA_SIZE:
        raise HTTPException(status_code=400, detail="File is too large (max 50MB)")

    SOCIAL_MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = SOCIAL_MEDIA_UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(content)

    file_url = f"/uploads/social/{filename}"

    # Determine media type
    media_type = "document"
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        media_type = "image"
    elif ext in {".mp4", ".mov", ".avi"}:
        media_type = "video"
    elif ext in {".mp3", ".ogg", ".wav"}:
        media_type = "audio"

    record = social_media_hub.store_media(
        filename=filename,
        original_filename=file.filename or filename,
        file_path=str(file_path),
        file_url=file_url,
        mime_type=file.content_type or "",
        file_size=len(content),
        media_type=media_type,
        uploaded_by=auth.get("user_id"),
    )

    return {"success": True, "media": record}


@admin_router.get("/social/media")
async def social_list_media(
    media_type: str = Query(None),
    limit: int = Query(50),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"media": social_media_hub.get_media_library(media_type, limit)}


# ─── Reply Templates ───

@admin_router.get("/social/templates")
async def social_list_templates(
    category: str = Query(None),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"templates": social_media_hub.get_templates(category)}


@admin_router.post("/social/templates")
async def social_create_template(
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    template = social_media_hub.create_template(
        title=body.get("title", ""),
        content=body.get("content", ""),
        category=body.get("category", "general"),
        shortcut=body.get("shortcut", ""),
        platforms=body.get("platforms"),
        created_by=auth.get("user_id"),
    )
    return {"success": True, "template": template}


@admin_router.put("/social/templates/{template_id}")
async def social_update_template(
    template_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    social_media_hub.update_template(template_id, **body)
    return {"success": True}


@admin_router.delete("/social/templates/{template_id}")
async def social_delete_template(
    template_id: int,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    social_media_hub.delete_template(template_id)
    return {"success": True}


# ─── SSE Stream ───

@admin_router.get("/social/stream")
async def social_message_stream(
    # EventSource can't set custom headers — accept auth via query param too
    authorization: str = Query(None),
    x_admin_password: str = Query(None),
):
    import asyncio
    import json
    from fastapi.responses import StreamingResponse

    # Normalise: query param may contain "Bearer <token>" or raw JWT
    auth_header = authorization if authorization and (authorization.startswith("Bearer ") or authorization.startswith("bearer ")) else None
    admin_pw = x_admin_password or (authorization if authorization and not auth_header else None)

    auth = _check_admin_auth(admin_pw, auth_header,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    async def event_generator():
        event = social_media_hub.subscribe_social_inbox()
        last_signal = social_media_hub.get_social_signal()
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\\n\\n"
            while True:
                try:
                    await asyncio.wait_for(event.wait(), timeout=15)
                    event.clear()
                except asyncio.TimeoutError:
                    pass

                current_signal = social_media_hub.get_social_signal()
                if current_signal and current_signal != last_signal:
                    last_signal = current_signal
                    yield f"data: {json.dumps({'type': 'new_message', 'data': current_signal})}\\n\\n"
                else:
                    yield f": heartbeat\\n\\n"
        except asyncio.CancelledError:
            pass
        finally:
            social_media_hub.unsubscribe_social_inbox(event)

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─── Analytics ───

@admin_router.get("/social/analytics")
async def social_analytics(
    period: str = Query("weekly"),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="social_media", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return social_media_hub.get_analytics(period)


# ═══════════════════════ Blog Management ═══════════════════════

@admin_router.get("/blog")
async def admin_list_blog_posts(
    status: str = Query(None),
    category: str = Query(None),
    post_type: str = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    posts = blog.list_posts(status=status, category=category, limit=limit, offset=offset, post_type=post_type)
    return {"posts": posts}


@admin_router.get("/blog/analytics")
async def admin_blog_analytics(
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return blog.get_analytics()


@admin_router.get("/blog/{post_id}")
async def admin_get_blog_post(
    post_id: int,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    post = blog.get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@admin_router.post("/blog")
async def admin_create_blog_post(
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    result = blog.create_post(
        title=body.get("title", ""),
        excerpt=body.get("excerpt", ""),
        body=body.get("body", ""),
        category=body.get("category", "general"),
        tags=body.get("tags", []),
        cover_image=body.get("cover_image", ""),
        video_url=body.get("video_url", ""),
        status=body.get("status", "draft"),
        author_name=body.get("author_name", "Spark AI"),
        post_type=body.get("post_type", "blog"),
        teams=body.get("teams", []),
    )
    _log_action(auth, "create_blog_post", "blog", request, details={"post_id": result.get("id")})
    return result


@admin_router.put("/blog/{post_id}")
async def admin_update_blog_post(
    post_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Check if this is a new publish (was not published before)
    existing = blog.get_post(post_id)
    was_published = existing and existing.get("status") == "published" if existing else False

    body = await request.json()
    send_push = body.pop("send_push", True)
    result = blog.update_post(post_id, **body)
    _log_action(auth, "update_blog_post", "blog", request, details={"post_id": post_id})

    # Send push notification if newly published
    if (result.get("success") and body.get("status") == "published"
            and not was_published and send_push):
        try:
            import push_notifications
            post = blog.get_post(post_id)
            if post:
                push_notifications.send_news_push_to_all(
                    post_title=post.get("title", "News Update"),
                    post_excerpt=post.get("excerpt", ""),
                    post_slug=post.get("slug", ""),
                    cover_image=post.get("cover_image"),
                )
                print(f"[Admin] Push notification sent for news: {post.get('title', '')[:50]}")
        except Exception as e:
            print(f"[Admin] Push notification error: {e}")

    return result


@admin_router.delete("/blog/{post_id}")
async def admin_delete_blog_post(
    post_id: int,
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="delete")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    result = blog.delete_post(post_id)
    _log_action(auth, "delete_blog_post", "blog", request, details={"post_id": post_id})
    return result


@admin_router.post("/blog/scrape-now")
async def admin_scrape_telegram(
    request: Request,
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    """Trigger immediate Telegram channel scrape."""
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        import telegram_scraper
        results = []
        for channel in telegram_scraper.SCRAPE_CHANNELS:
            result = await telegram_scraper.async_channel_to_blog(channel)
            results.append(result)
        total_new = sum(r["new_posts"] for r in results)
        total_skipped = sum(r["skipped"] for r in results)
        _log_action(auth, "scrape_telegram", "blog", request,
                    details={"new": total_new, "skipped": total_skipped})
        return {"success": True, "new_posts": total_new, "skipped": total_skipped, "details": results}
    except Exception as e:
        return {"success": False, "error": str(e)}


@admin_router.post("/blog/upload-image")
async def admin_upload_blog_image(
    file: UploadFile = File(...),
    x_admin_password: str = Header(None),
    authorization: str = Header(None),
):
    auth = _check_admin_auth(x_admin_password, authorization,
                             required_module="blog", required_action="write")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(status_code=400, detail=f"Image type {ext} is not allowed")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=400, detail="Image is too large (max 10MB)")

    url = blog.save_cover_image(content, file.filename or "image.jpg")
    return {"success": True, "url": url}
