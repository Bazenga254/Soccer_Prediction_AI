"""
Admin Routes for Spark AI - Extracted from main.py
All /api/admin/* endpoints with RBAC integration and activity logging.
"""

from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import uuid
import os

import user_auth
import access_codes
import community
import subscriptions
import prediction_tracker
import swypt_payment
import admin_rbac
import activity_logger

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
        profile["transactions"] = swypt_payment.get_user_transactions(user_id, limit=10)
    except Exception:
        profile["transactions"] = []

    try:
        profile["withdrawals"] = swypt_payment.get_user_withdrawals(user_id)
    except Exception:
        profile["withdrawals"] = []

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
    """Suspend or unsuspend a user. When suspending: hides predictions, refunds purchases, notifies buyers."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin'}, required_module="users", required_action="edit")
    if not auth:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.toggle_user_active(user_id, 1 if body.is_active else 0)
    _log_action(auth, "toggle_active", "users", request, "user", user_id, {"is_active": body.is_active})

    # When suspending: hide predictions, refund purchases, notify buyers
    suspension_result = None
    if not body.is_active:
        suspension_result = community.handle_user_suspension(user_id)

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
    return {"withdrawals": swypt_payment.get_all_pending_withdrawals()}


@admin_router.post("/withdrawals/{request_id}/approve")
async def approve_withdrawal(request_id: int, request: Request,
                              body: AdminWithdrawalAction = AdminWithdrawalAction(),
                              x_admin_password: str = Header(None), authorization: str = Header(None)):
    """Approve a withdrawal request."""
    auth = _check_admin_auth(x_admin_password, authorization, {'super_admin', 'admin'},
                             required_module="withdrawals", required_action="approve")
    if not auth:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = swypt_payment.approve_withdrawal(request_id, body.admin_notes)
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
    result = swypt_payment.reject_withdrawal(request_id, body.admin_notes)
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
    result = swypt_payment.complete_withdrawal(request_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Completion failed"))
    _log_action(auth, "complete_withdrawal", "withdrawals", request, "withdrawal", request_id)
    return result


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
