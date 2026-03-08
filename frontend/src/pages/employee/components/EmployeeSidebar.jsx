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
  technical_hod: '#e84393',
  technical_support_agent: '#d63031',
}

const EMPLOYEE_PAGES = [
  { id: 'dashboard', icon: '\u{1F4CA}', label: 'Dashboard', requiredModule: null },
  { id: 'online', icon: '\u{1F7E2}', label: 'Online Users', requiredModule: 'online_users' },
  { id: 'users', icon: '\u{1F465}', label: 'Users', requiredModule: 'users' },
  { id: 'subscriptions', icon: '\u{1F48E}', label: 'Subscriptions', requiredModule: 'subscriptions' },
  { id: 'transactions', icon: '\u{1F9FE}', label: 'Transactions', requiredModule: 'transactions' },
  { id: 'withdrawals', icon: '\u{1F4B8}', label: 'Withdrawals', requiredModule: 'withdrawals' },
  { id: 'community', icon: '\u{1F4AC}', label: 'Community', requiredModule: 'community' },
  { id: 'referrals', icon: '\u{1F517}', label: 'Referrals', requiredModule: 'referrals' },
  { id: 'codes', icon: '\u{1F511}', label: 'Access Codes', requiredModule: 'access_codes' },
  { id: 'support', icon: '\u{1F3A7}', label: 'Customer Care', requiredModule: 'support' },
  { id: 'broadcast', icon: '\u{1F4E2}', label: 'Broadcast', requiredModule: 'broadcast' },
  { id: 'employees', icon: '\u{1F3E2}', label: 'Employees', requiredModule: 'employees' },
  { id: 'activity', icon: '\u{1F4CB}', label: 'Activity Logs', requiredModule: 'activity_logs' },
  { id: 'security', icon: '\u{1F512}', label: 'Security', requiredModule: 'security' },
  { id: 'predictions', icon: '\u{26BD}', label: 'Predictions', requiredModule: 'predictions' },
  { id: 'sales', icon: '\u{1F4B5}', label: 'Sales & Revenue', requiredModule: 'sales' },
  { id: 'settings', icon: '\u{2699}', label: 'Settings', requiredModule: 'settings' },
  { id: 'pricing', icon: '\u{1F4B2}', label: 'Pricing', requiredModule: 'pricing' },
  { id: 'bots', icon: '\u{1F916}', label: 'Bot Accounts', requiredModule: 'bots' },
  { id: 'analytics', icon: '\u{1F4C8}', label: 'Creator Analytics', requiredModule: 'analytics' },
  { id: 'social', icon: '\u{1F4F1}', label: 'Social Media', requiredModule: 'social_media' },
  { id: 'finance', icon: '\u{1F4B0}', label: 'Finance', requiredModule: 'finance' },
  { id: 'technical', icon: '\u{1F527}', label: 'Technical', requiredModule: 'technical' },
  { id: 'manager', icon: '\u{1F454}', label: 'Management', requiredLevel: 1 },
  { id: 'docs', icon: '\u{1F4DA}', label: 'Documentation', requiredModule: 'documentation' },
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
        <a href="/spark-ctrl-8k2v9x" className="emp-admin-link">
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
