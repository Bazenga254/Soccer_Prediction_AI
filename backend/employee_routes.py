"""
Employee Portal Routes for Spark AI.
All /api/employee/* endpoints with RBAC integration.
"""

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import user_auth
import admin_rbac
import activity_logger
import employee_portal
import community

employee_router = APIRouter(prefix="/api/employee", tags=["employee"])


# ─── Request Models ───

class CreateInvoiceRequest(BaseModel):
    title: str
    amount: float
    category: str = "general"
    currency: str = "KES"
    client_name: str = ""
    due_date: Optional[str] = None
    description: str = ""

class CreateExpenseRequest(BaseModel):
    title: str
    amount: float
    category: str = "operational"
    currency: str = "KES"
    notes: str = ""
    receipt_url: Optional[str] = None

class InvoiceStatusRequest(BaseModel):
    status: str

class ExpenseApproveRequest(BaseModel):
    approve: bool = True

class CreateInviteRequest(BaseModel):
    role_name: str
    department: Optional[str] = None
    expires_hours: int = 72
    note: str = ""

class ModerateRequest(BaseModel):
    action: str  # "hide" or "remove"

class SuspendRequest(BaseModel):
    is_active: bool


# ─── Auth Helper ───

def _get_employee(authorization: str = None):
    """Extract employee user from JWT. Requires valid staff role."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    payload = user_auth.verify_token(token)
    if not payload or not payload.get("user_id"):
        return None

    user_id = payload["user_id"]
    # Must have a staff role via RBAC
    role_info = admin_rbac.get_user_role(user_id)
    if not role_info:
        # Fallback to legacy staff_role
        legacy = user_auth.get_staff_role(user_id)
        if not legacy:
            return None
        return {
            "user_id": user_id,
            "role_name": legacy,
            "role_level": 99,
            "department": None,
            "display_name": payload.get("username", ""),
        }

    profile = user_auth.get_user_profile(user_id)
    return {
        "user_id": user_id,
        "role_name": role_info["name"],
        "role_level": role_info["level"],
        "department": role_info.get("department"),
        "display_name": profile["display_name"] if profile else "",
    }


def _require_employee(authorization: str = None):
    """Get employee or raise 403."""
    emp = _get_employee(authorization)
    if not emp:
        raise HTTPException(status_code=403, detail="Employee access required")
    return emp


def _require_permission(user_id: int, module: str, action: str = "read"):
    """Check RBAC permission or raise 403."""
    if not admin_rbac.has_permission(user_id, module, action):
        raise HTTPException(status_code=403, detail=f"No {action} permission for {module}")


def _require_level(emp: dict, max_level: int = 1):
    """Require role level <= max_level or raise 403."""
    if emp["role_level"] > max_level:
        raise HTTPException(status_code=403, detail="Insufficient role level")


# ─── Dashboard ───

@employee_router.get("/dashboard")
async def emp_dashboard(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    data = employee_portal.get_employee_dashboard(emp["user_id"])
    return data


# ─── Finance: Invoices ───

@employee_router.get("/finance/invoices")
async def emp_list_invoices(
    status: str = Query(None),
    page: int = Query(1),
    authorization: str = Header(None),
):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "read")
    return employee_portal.get_invoices(status=status, page=page)


@employee_router.post("/finance/invoices")
async def emp_create_invoice(body: CreateInvoiceRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "write")
    result = employee_portal.create_invoice(
        title=body.title, amount=body.amount, category=body.category,
        created_by=emp["user_id"], currency=body.currency,
        client_name=body.client_name, due_date=body.due_date,
        description=body.description,
    )
    activity_logger.log_action(emp["user_id"], "create_invoice", "finance", "invoice", details=body.title)
    return result


@employee_router.put("/finance/invoices/{invoice_id}/status")
async def emp_update_invoice(invoice_id: int, body: InvoiceStatusRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "edit")
    result = employee_portal.update_invoice_status(invoice_id, body.status, approved_by=emp["user_id"])
    activity_logger.log_action(emp["user_id"], f"update_invoice_{body.status}", "finance", "invoice", target_id=invoice_id)
    return result


# ─── Finance: Expenses ───

@employee_router.get("/finance/expenses")
async def emp_list_expenses(
    status: str = Query(None),
    page: int = Query(1),
    authorization: str = Header(None),
):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "read")
    return employee_portal.get_expenses(status=status, page=page)


@employee_router.post("/finance/expenses")
async def emp_create_expense(body: CreateExpenseRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "write")
    result = employee_portal.create_expense(
        title=body.title, amount=body.amount, category=body.category,
        submitted_by=emp["user_id"], currency=body.currency,
        notes=body.notes, receipt_url=body.receipt_url,
    )
    activity_logger.log_action(emp["user_id"], "submit_expense", "finance", "expense", details=body.title)
    return result


@employee_router.put("/finance/expenses/{expense_id}/approve")
async def emp_approve_expense(expense_id: int, body: ExpenseApproveRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "approve")
    result = employee_portal.approve_expense(expense_id, emp["user_id"], approve=body.approve)
    action = "approve_expense" if body.approve else "reject_expense"
    activity_logger.log_action(emp["user_id"], action, "finance", "expense", target_id=expense_id)
    return result


@employee_router.get("/finance/summary")
async def emp_financial_summary(
    period: str = Query("month"),
    authorization: str = Header(None),
):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "finance", "read")
    return employee_portal.get_financial_summary(period=period)


# ─── Technical ───

@employee_router.get("/technical/health")
async def emp_system_health(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "technical", "read")
    return employee_portal.get_system_health()


@employee_router.get("/technical/api-stats")
async def emp_api_stats(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "technical", "read")
    return employee_portal.get_api_usage_stats()


@employee_router.get("/technical/errors")
async def emp_error_logs(limit: int = Query(50), authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "technical", "read")
    return {"errors": employee_portal.get_recent_errors(limit=limit)}


@employee_router.get("/technical/moderation")
async def emp_moderation_queue(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "technical", "read")
    return {"items": employee_portal.get_moderation_queue()}


@employee_router.post("/technical/moderate/{prediction_id}")
async def emp_moderate_content(prediction_id: int, body: ModerateRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "technical", "edit")
    result = employee_portal.moderate_prediction(prediction_id, body.action)
    activity_logger.log_action(emp["user_id"], f"moderate_{body.action}", "technical", "prediction", target_id=prediction_id)
    return result


# ─── Support / Customer Care ───

@employee_router.get("/support/conversations")
async def emp_support_conversations(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "read")
    convs = community.get_support_conversations()
    return {"conversations": convs}


@employee_router.get("/support/messages/{user_id}")
async def emp_support_messages(user_id: int, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "read")
    msgs = community.get_support_messages(user_id)
    return {"messages": msgs}


@employee_router.post("/support/send/{user_id}")
async def emp_send_support_message(user_id: int, authorization: str = Header(None), content: str = ""):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "write")
    community.send_support_message(
        user_id, "admin", content,
        agent_id=emp["user_id"], agent_name=emp["display_name"],
    )
    return {"success": True}


@employee_router.post("/support/close/{user_id}")
async def emp_close_support(user_id: int, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "write")
    community.close_conversation(user_id, "agent_closed")
    community.send_support_message(user_id, "system", "This conversation has been closed by the support team.")
    return {"success": True}


@employee_router.get("/support/ratings")
async def emp_support_ratings(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "read")
    try:
        ratings = community.get_agent_ratings(emp["user_id"])
        recent = community.get_recent_ratings(limit=20)
        return {"my_ratings": ratings, "recent": recent}
    except Exception:
        return {"my_ratings": {}, "recent": []}


@employee_router.get("/support/user-lookup")
async def emp_user_lookup(q: str = Query(""), authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "read")
    if not q.strip():
        return {"users": []}
    import sqlite3
    conn = sqlite3.connect("users.db")
    conn.row_factory = sqlite3.Row
    search = f"%{q.strip()}%"
    rows = conn.execute(
        """SELECT id, email, display_name, username, avatar_color, avatar_url, tier, is_active, created_at
           FROM users WHERE email LIKE ? OR display_name LIKE ? OR username LIKE ? LIMIT 20""",
        (search, search, search),
    ).fetchall()
    conn.close()
    return {"users": [dict(r) for r in rows]}


@employee_router.get("/support/keepalive-prompts")
async def emp_keepalive_prompts(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "read")
    prompts = community.get_pending_keepalive_for_agent(emp["user_id"])
    return {"prompts": prompts}


@employee_router.post("/support/keepalive/{conversation_id}")
async def emp_keepalive_respond(conversation_id: int, keep_open: bool = True, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_permission(emp["user_id"], "support", "write")
    community.respond_keepalive(conversation_id, keep_open)
    if not keep_open:
        conv = community._get_db()
        row = conv.execute("SELECT user_id FROM support_conversations WHERE id = ?", (conversation_id,)).fetchone()
        conv.close()
        if row:
            community.send_support_message(row["user_id"], "system", "This conversation has been closed by the support team.")
            community.close_conversation(row["user_id"], "agent_closed")
    return {"success": True}


# ─── Manager: Employees ───

@employee_router.get("/manager/employees")
async def emp_list_employees(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    staff = user_auth.get_staff_members()
    # Add role info for each staff member
    for s in staff:
        role = admin_rbac.get_user_role(s["id"])
        s["role_info"] = role
    return {"employees": staff}


@employee_router.get("/manager/online-users")
async def emp_online_users(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    try:
        active = community.get_active_users(detailed=True)
        return {"users": active}
    except Exception:
        return {"users": []}


@employee_router.get("/manager/activity-logs")
async def emp_activity_logs(
    limit: int = Query(50),
    module: str = Query(None),
    authorization: str = Header(None),
):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    logs = activity_logger.get_recent_logs(limit=limit, module=module)
    return {"logs": logs}


@employee_router.post("/manager/suspend/{user_id}")
async def emp_suspend_user(user_id: int, body: SuspendRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)

    # Prevent self-suspension
    if user_id == emp["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")

    # Prevent suspending owner
    target_level = admin_rbac.get_role_level(user_id)
    if target_level <= 0:
        raise HTTPException(status_code=403, detail="Cannot suspend the owner")

    user_auth.toggle_user_active(user_id, body.is_active)
    if not body.is_active:
        community.handle_user_suspension(user_id)

    action = "activate_user" if body.is_active else "suspend_user"
    activity_logger.log_action(emp["user_id"], action, "users", "user", target_id=user_id)
    return {"success": True}


# ─── Invites ───

@employee_router.post("/invites/create")
async def emp_create_invite(body: CreateInviteRequest, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    result = employee_portal.create_invite(
        role_name=body.role_name,
        department=body.department,
        created_by=emp["user_id"],
        created_by_name=emp["display_name"],
        expires_hours=body.expires_hours,
        note=body.note,
    )
    activity_logger.log_action(emp["user_id"], "create_invite", "employees", details=f"role={body.role_name}")
    return result


@employee_router.get("/invites")
async def emp_list_invites(authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    invites = employee_portal.get_invites()
    return {"invites": invites}


@employee_router.post("/invites/{invite_id}/revoke")
async def emp_revoke_invite(invite_id: int, authorization: str = Header(None)):
    emp = _require_employee(authorization)
    _require_level(emp, 1)
    result = employee_portal.revoke_invite(invite_id)
    activity_logger.log_action(emp["user_id"], "revoke_invite", "employees", target_id=invite_id)
    return result
