import AuthForm from '../components/AuthForm'

export default function AccessGate() {
  return (
    <div className="access-gate-page">
      <div className="access-gate-container">
        <AuthForm initialMode="login" />
      </div>
    </div>
  )
}
