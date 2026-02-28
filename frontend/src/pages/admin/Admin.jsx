import { useState, Component } from 'react'
import { AdminProvider, useAdmin } from './context/AdminContext'
import AdminLogin from './AdminLogin'
import AdminSidebar from './components/AdminSidebar'
import OverviewTab from './tabs/OverviewTab'
import OnlineUsersTab from './tabs/OnlineUsersTab'
import UsersTab from './tabs/UsersTab'
import SubscriptionsTab from './tabs/SubscriptionsTab'
import WithdrawalsTab from './tabs/WithdrawalsTab'
import CommunityTab from './tabs/CommunityTab'
import ReferralsTab from './tabs/ReferralsTab'
import AccessCodesTab from './tabs/AccessCodesTab'
import SupportTab from './tabs/SupportTab'
import StaffTab from './tabs/StaffTab'
import ActivityLogsTab from './tabs/ActivityLogsTab'
import SecurityTab from './tabs/SecurityTab'
import PredictionsTab from './tabs/PredictionsTab'
import SalesTab from './tabs/SalesTab'
import SettingsTab from './tabs/SettingsTab'
import BroadcastTab from './tabs/BroadcastTab'
import BotsTab from './tabs/BotsTab'
import DocsTab from './tabs/DocsTab'
import CreatorAnalyticsTab from './tabs/CreatorAnalyticsTab'
import PricingTab from './tabs/PricingTab'
import ExtensionTab from './tabs/ExtensionTab'
import TransactionsTab from './tabs/TransactionsTab'
import './styles/admin.css'

class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Admin Error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#e74c3c', background: '#0f1117', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Admin Portal Error</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#94a3b8' }}>
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const TAB_COMPONENTS = {
  overview: OverviewTab,
  online: OnlineUsersTab,
  users: UsersTab,
  subscriptions: SubscriptionsTab,
  transactions: TransactionsTab,
  withdrawals: WithdrawalsTab,
  community: CommunityTab,
  referrals: ReferralsTab,
  codes: AccessCodesTab,
  support: SupportTab,
  staff: StaffTab,
  activity: ActivityLogsTab,
  security: SecurityTab,
  predictions: PredictionsTab,
  sales: SalesTab,
  settings: SettingsTab,
  broadcast: BroadcastTab,
  bots: BotsTab,
  docs: DocsTab,
  analytics: CreatorAnalyticsTab,
  pricing: PricingTab,
  extension: ExtensionTab,
}

function AdminShell() {
  const { isLoggedIn, loading } = useAdmin()
  const [activeTab, setActiveTab] = useState('overview')

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-spinner" />
        <p>Loading admin portal...</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <AdminLogin />
  }

  const ActiveTabComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="admin-page">
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="admin-main">
        <div className="admin-content">
          {ActiveTabComponent ? <ActiveTabComponent /> : <div>Tab not found</div>}
        </div>
      </div>
    </div>
  )
}

export default function Admin() {
  return (
    <AdminErrorBoundary>
      <AdminProvider>
        <AdminShell />
      </AdminProvider>
    </AdminErrorBoundary>
  )
}
