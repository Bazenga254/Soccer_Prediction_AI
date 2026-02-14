"""
Role-Based Access Control (RBAC) Engine for Spark AI Admin Portal.
Manages roles, permissions, hierarchy, and data scoping.
"""

import sqlite3
from datetime import datetime
from typing import Optional, Dict, List

DB_PATH = "users.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── Role Hierarchy ───

ROLE_HIERARCHY = [
    {"name": "owner", "display_name": "Owner", "level": 0, "department": None, "description": "Full unrestricted access to everything"},
    {"name": "general_manager", "display_name": "General Manager", "level": 1, "department": None, "description": "Operational oversight across all departments"},
    {"name": "sales_hod", "display_name": "Sales HOD", "level": 2, "department": "sales", "description": "Head of Sales department"},
    {"name": "customer_care_hod", "display_name": "Customer Care HOD", "level": 2, "department": "customer_care", "description": "Head of Customer Care department"},
    {"name": "marketing_hod", "display_name": "Marketing HOD", "level": 2, "department": "marketing", "description": "Head of Marketing department"},
    {"name": "predictions_hod", "display_name": "Predictions Analyst HOD", "level": 2, "department": "predictions", "description": "Head of Predictions department"},
    {"name": "technical_hod", "display_name": "Technical HOD", "level": 2, "department": "technical", "description": "Head of Technical department"},
    {"name": "sales_agent", "display_name": "Sales Agent", "level": 3, "department": "sales", "description": "Sales team member"},
    {"name": "customer_support_agent", "display_name": "Customer Support Agent", "level": 3, "department": "customer_care", "description": "Customer support team member"},
    {"name": "prediction_analyst", "display_name": "Prediction Analyst", "level": 3, "department": "predictions", "description": "Predictions team member"},
    {"name": "technical_support_agent", "display_name": "Technical Support Agent", "level": 3, "department": "technical", "description": "Technical support team member"},
]

# Modules that can have permissions
ALL_MODULES = [
    "dashboard", "users", "employees", "sales", "predictions",
    "support", "activity_logs", "security", "settings",
    "community", "referrals", "access_codes", "withdrawals", "subscriptions",
    "online_users", "finance", "technical",
]

# Default permission matrix: role_name -> {module: {perms}}
# R=read, W=write, E=edit, D=delete, X=export, A=approve
# Scope: own, department, company
DEFAULT_PERMISSIONS = {
    "owner": {
        "dashboard":     {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "users":         {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "employees":     {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "sales":         {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "predictions":   {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "support":       {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "security":      {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "settings":      {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 0, "approve": 1, "scope": "company"},
        "community":     {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "referrals":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "access_codes":  {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 0, "approve": 0, "scope": "company"},
        "withdrawals":   {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 1, "approve": 1, "scope": "company"},
        "subscriptions": {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "online_users":  {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "finance":       {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
        "technical":     {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "company"},
    },
    "general_manager": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "users":         {"read": 1, "write": 0, "edit": 1, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "employees":     {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 1, "approve": 1, "scope": "company"},
        "sales":         {"read": 0, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "predictions":   {"read": 1, "write": 0, "edit": 1, "delete": 0, "export": 1, "approve": 1, "scope": "company"},
        "support":       {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "security":      {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "settings":      {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "community":     {"read": 1, "write": 0, "edit": 1, "delete": 1, "export": 0, "approve": 1, "scope": "company"},
        "referrals":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "access_codes":  {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "withdrawals":   {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 1, "scope": "company"},
        "subscriptions": {"read": 1, "write": 0, "edit": 1, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "online_users":  {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "finance":       {"read": 0, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "technical":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
    },
    "sales_hod": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "department"},
        "users":         {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "employees":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "sales":         {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "department"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "referrals":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "department"},
        "subscriptions": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "finance":       {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "department"},
    },
    "customer_care_hod": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "users":         {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "employees":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "support":       {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "department"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "online_users":  {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
    },
    "marketing_hod": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "users":         {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "employees":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "referrals":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "company"},
        "community":     {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
    },
    "predictions_hod": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "employees":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "predictions":   {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "department"},
        "community":     {"read": 1, "write": 0, "edit": 1, "delete": 1, "export": 0, "approve": 1, "scope": "company"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "technical":     {"read": 1, "write": 0, "edit": 1, "delete": 0, "export": 0, "approve": 1, "scope": "department"},
    },
    "sales_agent": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "sales":         {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "referrals":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
    },
    "customer_support_agent": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "users":         {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "support":       {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "community":     {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "online_users":  {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
    },
    "prediction_analyst": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "predictions":   {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "community":     {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
    },
    "technical_hod": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 1, "approve": 0, "scope": "department"},
        "users":         {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
        "employees":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "technical":     {"read": 1, "write": 1, "edit": 1, "delete": 1, "export": 1, "approve": 1, "scope": "department"},
        "support":       {"read": 1, "write": 1, "edit": 1, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "department"},
        "community":     {"read": 1, "write": 0, "edit": 1, "delete": 1, "export": 0, "approve": 1, "scope": "company"},
        "online_users":  {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "company"},
    },
    "technical_support_agent": {
        "dashboard":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "technical":     {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "support":       {"read": 1, "write": 1, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "community":     {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
        "activity_logs": {"read": 1, "write": 0, "edit": 0, "delete": 0, "export": 0, "approve": 0, "scope": "own"},
    },
}


# ─── Seed Functions ───

def seed_default_roles():
    """Populate the roles table with the default hierarchy. Idempotent."""
    conn = _get_db()
    now = datetime.now().isoformat()
    for role in ROLE_HIERARCHY:
        existing = conn.execute("SELECT id FROM roles WHERE name = ?", (role["name"],)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO roles (name, display_name, level, department, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
                (role["name"], role["display_name"], role["level"], role["department"], role["description"], now),
            )
    conn.commit()
    conn.close()


def seed_default_permissions():
    """Populate the permissions table with the default permission matrix. Idempotent."""
    conn = _get_db()
    for role_name, modules in DEFAULT_PERMISSIONS.items():
        role = conn.execute("SELECT id FROM roles WHERE name = ?", (role_name,)).fetchone()
        if not role:
            continue
        role_id = role["id"]
        for module, perms in modules.items():
            existing = conn.execute(
                "SELECT id FROM permissions WHERE role_id = ? AND module = ?",
                (role_id, module),
            ).fetchone()
            if not existing:
                conn.execute(
                    """INSERT INTO permissions (role_id, module, can_read, can_write, can_edit, can_delete, can_export, can_approve, data_scope)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (role_id, module, perms["read"], perms["write"], perms["edit"],
                     perms["delete"], perms["export"], perms["approve"], perms["scope"]),
                )
    conn.commit()
    conn.close()


def migrate_legacy_roles():
    """Map existing staff_role text values to the new role_id system."""
    MIGRATION_MAP = {
        "super_admin": "owner",
        "customer_care": "customer_support_agent",
        "technical_support": "technical_hod",
        "accounting": "general_manager",
    }
    conn = _get_db()
    staff = conn.execute("SELECT id, staff_role FROM users WHERE staff_role IS NOT NULL AND role_id IS NULL").fetchall()
    for user in staff:
        new_role_name = MIGRATION_MAP.get(user["staff_role"])
        if new_role_name:
            role = conn.execute("SELECT id, department FROM roles WHERE name = ?", (new_role_name,)).fetchone()
            if role:
                conn.execute(
                    "UPDATE users SET role_id = ?, department = ? WHERE id = ?",
                    (role["id"], role["department"], user["id"]),
                )
    conn.commit()
    conn.close()


# ─── Permission Checking ───

def has_permission(user_id: int, module: str, action: str = "read") -> bool:
    """Check if a user has permission to perform an action on a module."""
    conn = _get_db()
    user = conn.execute("SELECT role_id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["role_id"]:
        conn.close()
        return False

    action_col = f"can_{action}"
    if action_col not in ("can_read", "can_write", "can_edit", "can_delete", "can_export", "can_approve"):
        conn.close()
        return False

    perm = conn.execute(
        f"SELECT {action_col} FROM permissions WHERE role_id = ? AND module = ?",
        (user["role_id"], module),
    ).fetchone()
    conn.close()
    return bool(perm and perm[action_col])


def get_data_scope(user_id: int, module: str) -> str:
    """Get the data scope for a user on a module: 'own', 'department', or 'company'."""
    conn = _get_db()
    user = conn.execute("SELECT role_id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["role_id"]:
        conn.close()
        return "own"

    perm = conn.execute(
        "SELECT data_scope FROM permissions WHERE role_id = ? AND module = ?",
        (user["role_id"], module),
    ).fetchone()
    conn.close()
    return perm["data_scope"] if perm else "own"


def get_role_level(user_id: int) -> int:
    """Get the hierarchy level for a user. 0=owner, 1=gm, 2=hod, 3=staff. Returns 99 if no role."""
    conn = _get_db()
    user = conn.execute("SELECT role_id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["role_id"]:
        conn.close()
        return 99

    role = conn.execute("SELECT level FROM roles WHERE id = ?", (user["role_id"],)).fetchone()
    conn.close()
    return role["level"] if role else 99


def get_user_role(user_id: int) -> Optional[Dict]:
    """Get full role info for a user."""
    conn = _get_db()
    row = conn.execute(
        """SELECT r.id, r.name, r.display_name, r.level, r.department, r.description
           FROM users u JOIN roles r ON u.role_id = r.id
           WHERE u.id = ?""",
        (user_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_accessible_modules(user_id: int) -> List[Dict]:
    """Get all modules a user can access with their permission details."""
    conn = _get_db()
    user = conn.execute("SELECT role_id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["role_id"]:
        conn.close()
        return []

    rows = conn.execute(
        """SELECT module, can_read, can_write, can_edit, can_delete, can_export, can_approve, data_scope
           FROM permissions WHERE role_id = ? AND can_read = 1""",
        (user["role_id"],),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Role CRUD ───

def get_all_roles() -> List[Dict]:
    """Get all roles with their permission counts."""
    conn = _get_db()
    roles = conn.execute(
        """SELECT r.*, COUNT(p.id) as permission_count,
                  (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) as staff_count
           FROM roles r LEFT JOIN permissions p ON r.id = p.id
           GROUP BY r.id ORDER BY r.level, r.name""",
    ).fetchall()
    conn.close()
    return [dict(r) for r in roles]


def get_role_permissions(role_id: int) -> List[Dict]:
    """Get all permissions for a specific role."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM permissions WHERE role_id = ? ORDER BY module",
        (role_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_role(name: str, display_name: str, level: int, department: str = None, description: str = "") -> Dict:
    """Create a new custom role."""
    conn = _get_db()
    existing = conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Role name already exists"}

    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO roles (name, display_name, level, department, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        (name, display_name, level, department, description, now),
    )
    conn.commit()
    role_id = conn.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()["id"]
    conn.close()
    return {"success": True, "role_id": role_id}


def update_role_permission(role_id: int, module: str, permissions: Dict) -> Dict:
    """Update or create permissions for a role on a module."""
    conn = _get_db()
    role = conn.execute("SELECT id FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not role:
        conn.close()
        return {"success": False, "error": "Role not found"}

    existing = conn.execute(
        "SELECT id FROM permissions WHERE role_id = ? AND module = ?",
        (role_id, module),
    ).fetchone()

    if existing:
        conn.execute(
            """UPDATE permissions SET can_read=?, can_write=?, can_edit=?, can_delete=?,
               can_export=?, can_approve=?, data_scope=? WHERE role_id=? AND module=?""",
            (permissions.get("read", 0), permissions.get("write", 0), permissions.get("edit", 0),
             permissions.get("delete", 0), permissions.get("export", 0), permissions.get("approve", 0),
             permissions.get("scope", "own"), role_id, module),
        )
    else:
        conn.execute(
            """INSERT INTO permissions (role_id, module, can_read, can_write, can_edit, can_delete, can_export, can_approve, data_scope)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (role_id, module, permissions.get("read", 0), permissions.get("write", 0),
             permissions.get("edit", 0), permissions.get("delete", 0), permissions.get("export", 0),
             permissions.get("approve", 0), permissions.get("scope", "own")),
        )

    conn.commit()
    conn.close()
    return {"success": True}


def delete_role(role_id: int) -> Dict:
    """Delete a custom role. System roles cannot be deleted."""
    conn = _get_db()
    role = conn.execute("SELECT is_system FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not role:
        conn.close()
        return {"success": False, "error": "Role not found"}
    if role["is_system"]:
        conn.close()
        return {"success": False, "error": "Cannot delete system roles"}

    # Unassign users from this role
    conn.execute("UPDATE users SET role_id = NULL, department = NULL WHERE role_id = ?", (role_id,))
    conn.execute("DELETE FROM permissions WHERE role_id = ?", (role_id,))
    conn.execute("DELETE FROM roles WHERE id = ?", (role_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def assign_role(user_id: int, role_id: int) -> Dict:
    """Assign a role to a user."""
    conn = _get_db()
    user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    role = conn.execute("SELECT id, name, department FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not role:
        conn.close()
        return {"success": False, "error": "Role not found"}

    # Also update legacy staff_role for backward compatibility
    legacy_map = {
        "owner": "super_admin",
        "general_manager": "accounting",
        "customer_care_hod": "technical_support",
        "customer_support_agent": "customer_care",
        "sales_hod": "accounting",
        "predictions_hod": "super_admin",
        "marketing_hod": "super_admin",
        "sales_agent": "accounting",
        "prediction_analyst": "super_admin",
    }

    conn.execute(
        "UPDATE users SET role_id = ?, department = ?, staff_role = ? WHERE id = ?",
        (role_id, role["department"], legacy_map.get(role["name"], "super_admin"), user_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "role": dict(role)}


def remove_role(user_id: int) -> Dict:
    """Remove a user's role (demote to regular user)."""
    conn = _get_db()
    conn.execute(
        "UPDATE users SET role_id = NULL, department = NULL, staff_role = NULL WHERE id = ?",
        (user_id,),
    )
    conn.commit()
    conn.close()
    return {"success": True}
