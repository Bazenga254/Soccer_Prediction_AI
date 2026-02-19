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

admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "SoccerAI2026Admin")

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

                # Legacy role check (backward compat)
                if required_roles:
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
    if cur not in ("kes", "usd"):
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
    else:
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed'"

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


@admin_router.get("/referral-stats")
async def admin_referral_stats(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Get referral leaderboard."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="referrals", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"referrals": user_auth.get_all_referral_stats()}


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
            u["ip_address"] = t.get("ip_address", "")
            u["browser"] = t.get("browser", "")
            u["os"] = t.get("os", "")
            u["device_type"] = t.get("device_type", "")
            u["source"] = t.get("source", "Direct")
    except Exception:
        pass
    return {"users": users}


@admin_router.get("/users/{user_id}")
async def admin_get_user(user_id: int, x_admin_password: str = Header(None), authorization: str = Header(None)):
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
    conn.close()
    if row:
        profile["is_active"] = bool(row["is_active"])
        profile["login_count"] = row["login_count"]
        profile["last_login"] = row["last_login"]
        profile["referred_by"] = row["referred_by"]

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

    try:
        profile["balance_adjustments"] = community.get_balance_adjustments(user_id, limit=10)
    except Exception:
        profile["balance_adjustments"] = []

    try:
        profile["transactions"] = daraja_payment.get_user_transactions(user_id, limit=10)
    except Exception:
        profile["transactions"] = []

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
    result = user_auth.set_user_tier(user_id, body.tier)
    _log_action(auth, "set_tier", "users", request, "user", user_id, {"tier": body.tier})
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
    community.close_conversation(user_id, "agent_closed")
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
async def admin_list_subscriptions(x_admin_password: str = Header(None), authorization: str = Header(None)):
    """List all pro-tier users with subscription details."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'accounting'},
                             required_module="subscriptions", required_action="read")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Get pro users
    conn = user_auth._get_db()
    rows = conn.execute(
        "SELECT id, email, display_name, username, avatar_color, created_at FROM users WHERE tier = 'pro' ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    pro_users = [dict(r) for r in rows]
    for u in pro_users:
        try:
            u["subscription"] = subscriptions.get_active_subscription(u["id"])
        except Exception:
            u["subscription"] = None
    return {"users": pro_users}


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

    # Super admin (level 0 owner or legacy password) auto-approves
    is_super = auth.get("role_level", 99) <= 1 or auth.get("is_admin")
    result = community.create_broadcast(
        sender_id=auth.get("user_id", 0),
        sender_name=auth.get("display_name", "Admin"),
        title=body.title.strip(),
        message=body.message.strip(),
        auto_approve=is_super,
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
