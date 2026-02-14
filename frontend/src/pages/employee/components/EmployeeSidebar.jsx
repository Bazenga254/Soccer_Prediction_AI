import { useEmployee } from '../context/EmployeeContext'

const ROLE_COLORS = {
  owner: '#e74c3c',
  general_manager: '#3498db',
  sales_hod: '#2ecc71',
  customer_care_hod: '#e67e22',
  marketing_hod: '#9b59b6',
  predictions_hod: '#1abc9c',
  sales_agent: '#27ae60',
  customer_support_agent: '#f39c12',
  prediction_analyst: '#16a085',
}

const EMPLOYEE_PAGES = [
  { id: 'dashboard', icon: '\u{1F4CA}', label: 'Dashboard', requiredModule: null },
  { id: 'support', icon: '\u{1F3A7}', label: 'Customer Care', requiredModule: 'support' },
  { id: 'finance', icon: '\u{1F4B0}', label: 'Finance', requiredModule: 'finance' },
  { id: 'technical', icon: '\u{1F527}', label: 'Technical', requiredModule: 'technical' },
  { id: 'manager', icon: '\u{1F454}', label: 'Management', requiredLevel: 1 },
]

export default function EmployeeSidebar({ activePage, setActivePage }) {
  const { roleInfo, hasPermission, currentUser, roleLevel, logout } = useEmployee()

  const visiblePages = EMPLOYEE_PAGES.filter(page => {
    if (page.requiredLevel !== undefined) return roleLevel <= page.requiredLevel
    if (page.requiredModule) return hasPermission(page.requiredModule, 'read')
    return true
  })

  const roleName = roleInfo?.display_name || 'Employee'
  const roleColor = ROLE_COLORS[roleInfo?.name] || '#6c5ce7'
  const displayName = currentUser?.display_name || 'Employee'

  return (
    <div className="emp-sidebar">
      <div className="emp-sidebar-header">
        <h2 className="emp-sidebar-title">Spark AI</h2>
        <span className="emp-sidebar-subtitle">Employee Portal</span>
        <div className="emp-role-badge" style={{ background: roleColor }}>
          {roleName}
        </div>
        <div className="emp-username">{displayName}</div>
      </div>

      <nav className="emp-sidebar-nav">
        {visiblePages.map(page => (
          <button
            key={page.id}
            className={`emp-nav-btn ${activePage === page.id ? 'active' : ''}`}
            onClick={() => setActivePage(page.id)}
          >
            <span className="emp-nav-icon">{page.icon}</span>
            <span className="emp-nav-label">{page.label}</span>
          </button>
        ))}
      </nav>

      <div className="emp-sidebar-footer">
        <a href="/admin" className="emp-admin-link">
          <span className="emp-nav-icon">{'\u{1F6E1}'}</span>
          <span className="emp-nav-label">Admin Panel</span>
        </a>
        <button className="emp-logout-btn" onClick={logout}>
          <span className="emp-nav-icon">{'\u{1F6AA}'}</span>
          <span className="emp-nav-label">Logout</span>
        </button>
      </div>
    </div>
  )
}
