import { useAdmin } from '../context/AdminContext'

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

const ALL_TABS = [
  { id: 'overview', icon: '📊', label: 'Overview', module: 'dashboard' },
  { id: 'online', icon: '🟢', label: 'Online Users', module: 'online_users' },
  { id: 'users', icon: '👥', label: 'Users', module: 'users' },
  { id: 'subscriptions', icon: '💎', label: 'Subscriptions', module: 'subscriptions' },
  { id: 'withdrawals', icon: '💸', label: 'Withdrawals', module: 'withdrawals' },
  { id: 'community', icon: '💬', label: 'Community', module: 'community' },
  { id: 'referrals', icon: '🔗', label: 'Referrals', module: 'referrals' },
  { id: 'codes', icon: '🔑', label: 'Access Codes', module: 'access_codes' },
  { id: 'support', icon: '🎧', label: 'Support', module: 'support' },
  { id: 'broadcast', icon: '📢', label: 'Broadcast', module: 'community' },
  { id: 'staff', icon: '🏢', label: 'Employees', module: 'employees' },
  { id: 'activity', icon: '📋', label: 'Activity Logs', module: 'activity_logs' },
  { id: 'security', icon: '🔒', label: 'Security', module: 'security' },
  { id: 'predictions', icon: '⚽', label: 'Predictions', module: 'predictions' },
  { id: 'sales', icon: '💰', label: 'Sales & Revenue', module: 'sales' },
  { id: 'settings', icon: '⚙️', label: 'Settings', module: 'settings' },
  { id: 'pricing', icon: '💲', label: 'Pricing', module: 'settings' },
  { id: 'bots', icon: '🤖', label: 'Bot Accounts', module: 'bots' },
  { id: 'analytics', icon: '📈', label: 'Creator Analytics', module: 'community' },
  { id: 'docs', icon: '📚', label: 'Documentation', module: 'dashboard' },
  { id: 'extension', icon: '🧩', label: 'Chrome Extension', module: 'dashboard' },
]

export default function AdminSidebar({ activeTab, setActiveTab }) {
  const { roleInfo, hasPermission, logout, currentUser } = useAdmin()

  const visibleTabs = ALL_TABS.filter(tab => hasPermission(tab.module, 'read'))

  const roleName = roleInfo?.display_name || 'Admin'
  const roleColor = ROLE_COLORS[roleInfo?.name] || '#6c5ce7'
  const displayName = currentUser?.display_name || 'Admin'

  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar-header">
        <h2>Spark AI</h2>
        <div className="admin-sidebar-role" style={{ background: roleColor }}>
          {roleName}
        </div>
        <div className="admin-sidebar-user">{displayName}</div>
      </div>

      <nav className="admin-sidebar-nav">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="admin-tab-icon">{tab.icon}</span>
            <span className="admin-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-logout-btn" onClick={logout}>
          🚪 Logout
        </button>
      </div>
    </div>
  )
}

export { ALL_TABS }
