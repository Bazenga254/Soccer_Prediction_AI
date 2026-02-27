import { useState, Component } from 'react'
import { EmployeeProvider, useEmployee } from './context/EmployeeContext'
import { AdminProvider } from '../admin/context/AdminContext'
import EmployeeSidebar from './components/EmployeeSidebar'
import EmployeeDashboard from './pages/EmployeeDashboard'
import FinancePage from './pages/FinancePage'
import TechnicalPage from './pages/TechnicalPage'
import CustomerCarePage from './pages/CustomerCarePage'
import ManagerPanel from './pages/ManagerPanel'
import BotsPage from './pages/BotsPage'
import EmployeeDocsPage from './pages/EmployeeDocsPage'
// Admin tab components for modules without employee-specific pages
import OnlineUsersTab from '../admin/tabs/OnlineUsersTab'
import UsersTab from '../admin/tabs/UsersTab'
import PredictionsTab from '../admin/tabs/PredictionsTab'
import CommunityTab from '../admin/tabs/CommunityTab'
import SalesTab from '../admin/tabs/SalesTab'
import SubscriptionsTab from '../admin/tabs/SubscriptionsTab'
import WithdrawalsTab from '../admin/tabs/WithdrawalsTab'
import ReferralsTab from '../admin/tabs/ReferralsTab'
import AccessCodesTab from '../admin/tabs/AccessCodesTab'
import ActivityLogsTab from '../admin/tabs/ActivityLogsTab'
import SecurityTab from '../admin/tabs/SecurityTab'
import StaffTab from '../admin/tabs/StaffTab'
import SettingsTab from '../admin/tabs/SettingsTab'
import './styles/employee.css'

class EmployeeErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Employee Portal Error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          color: '#e74c3c',
          background: '#0f1117',
          minHeight: '100vh',
          fontFamily: 'monospace',
        }}>
          <h2>Employee Portal Error</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#94a3b8' }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              cursor: 'pointer',
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 6,
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const PAGE_COMPONENTS = {
  dashboard: EmployeeDashboard,
  finance: FinancePage,
  technical: TechnicalPage,
  support: CustomerCarePage,
  manager: ManagerPanel,
  bots: BotsPage,
  docs: EmployeeDocsPage,
  // Admin tabs for granted permissions
  online: OnlineUsersTab,
  users: UsersTab,
  predictions: PredictionsTab,
  community: CommunityTab,
  sales: SalesTab,
  subscriptions: SubscriptionsTab,
  withdrawals: WithdrawalsTab,
  referrals: ReferralsTab,
  codes: AccessCodesTab,
  activity: ActivityLogsTab,
  security: SecurityTab,
  employees: StaffTab,
  settings: SettingsTab,
}

function EmployeeShell() {
  const { isLoggedIn, loading } = useEmployee()
  const [activePage, setActivePage] = useState('dashboard')

  if (loading) {
    return (
      <div className="emp-loading">
        <div className="emp-loading-spinner" />
        <p>Loading employee portal...</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    window.location.href = '/login'
    return (
      <div className="emp-loading">
        <p>Redirecting to login...</p>
      </div>
    )
  }

  const ActivePageComponent = PAGE_COMPONENTS[activePage]

  return (
    <div className="emp-page">
      <EmployeeSidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="emp-main">
        <div className="emp-content">
          {ActivePageComponent ? <ActivePageComponent /> : <div>Page not found</div>}
        </div>
      </div>
    </div>
  )
}

export default function Employee() {
  return (
    <EmployeeErrorBoundary>
      <AdminProvider>
        <EmployeeProvider>
          <EmployeeShell />
        </EmployeeProvider>
      </AdminProvider>
    </EmployeeErrorBoundary>
  )
}
