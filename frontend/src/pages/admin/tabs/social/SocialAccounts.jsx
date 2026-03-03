import { useState } from 'react'
import { useAdmin } from '../../context/AdminContext'

const PLATFORMS = [
  {
    key: 'telegram',
    name: 'Telegram',
    icon: '\u{1F4AC}',
    color: '#0088cc',
    available: true,
    description: 'Connect a Telegram Bot to receive and send messages.',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: '\u{1F4F1}',
    color: '#25d366',
    available: true,
    description: 'Connect WhatsApp via Twilio for business messaging.',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    icon: '\u{1F30D}',
    color: '#1877f2',
    available: false,
    description: 'Facebook Page messaging and content. Coming in Phase 2.',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    icon: '\u{1F4F7}',
    color: '#e1306c',
    available: false,
    description: 'Instagram DMs and post publishing. Coming in Phase 2.',
  },
  {
    key: 'x',
    name: 'X (Twitter)',
    icon: '\u{1D54F}',
    color: '#fff',
    available: false,
    description: 'X/Twitter DMs and tweet publishing. Coming in Phase 3.',
  },
]

export default function SocialAccounts({ accounts, onRefresh }) {
  const { getAuthHeaders } = useAdmin()
  const [setupPlatform, setSetupPlatform] = useState(null)
  const [setupStep, setSetupStep] = useState(1)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')

  // Telegram fields
  const [botToken, setBotToken] = useState('')
  const [accountName, setAccountName] = useState('')

  // WhatsApp fields
  const [accountSid, setAccountSid] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [fromNumber, setFromNumber] = useState('')

  const resetSetup = () => {
    setSetupPlatform(null)
    setSetupStep(1)
    setError('')
    setSuccess('')
    setWebhookUrl('')
    setBotToken('')
    setAccountName('')
    setAccountSid('')
    setAuthToken('')
    setFromNumber('')
  }

  const handleConnect = async () => {
    setConnecting(true)
    setError('')

    try {
      let credentials = {}
      let name = accountName

      if (setupPlatform === 'telegram') {
        if (!botToken.trim()) { setError('Bot token is required'); setConnecting(false); return }
        credentials = { bot_token: botToken.trim() }
        name = name || 'Telegram Bot'
      } else if (setupPlatform === 'whatsapp') {
        if (!accountSid || !authToken || !fromNumber) {
          setError('All fields are required')
          setConnecting(false)
          return
        }
        credentials = {
          account_sid: accountSid.trim(),
          auth_token: authToken.trim(),
          from_number: fromNumber.trim(),
        }
        name = name || 'WhatsApp Business'
      }

      const res = await fetch('/api/admin/social/accounts/connect', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: setupPlatform,
          account_name: name,
          credentials,
        })
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setSuccess('Connected successfully!')
        if (data.webhook_url) setWebhookUrl(data.webhook_url)
        if (data.bot_info) {
          setSuccess(`Connected! Bot: @${data.bot_info.username}`)
        }
        setSetupStep(3) // success step
        onRefresh()
      } else {
        setError(data.detail || data.error || 'Connection failed')
      }
    } catch (e) {
      setError('Connection failed. Please check your credentials.')
    }
    setConnecting(false)
  }

  const handleDisconnect = async (accountId) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return
    try {
      await fetch(`/api/admin/social/accounts/${accountId}/disconnect`, {
        method: 'POST', headers: getAuthHeaders()
      })
      onRefresh()
    } catch {}
  }

  const handleTestConnection = async (accountId) => {
    try {
      const res = await fetch(`/api/admin/social/accounts/${accountId}/status`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.live ? 'Connection is live and working!' : 'Connection may have issues. Check your credentials.')
      }
    } catch {
      alert('Failed to test connection.')
    }
  }

  return (
    <div>
      {/* Platform Cards */}
      <h4 style={{ color: 'var(--admin-text)', marginBottom: 12 }}>Connect a Platform</h4>
      <div className="social-accounts-grid">
        {PLATFORMS.map(p => {
          const connected = accounts.filter(a => a.platform === p.key && a.status === 'connected')
          return (
            <div key={p.key} className="social-account-card" style={{ opacity: p.available ? 1 : 0.5 }}>
              <div className={`social-platform-icon ${p.key}`}>
                <span style={{ fontSize: 24 }}>{p.icon}</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--admin-text)', marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                {p.description}
              </div>
              {connected.length > 0 && (
                <div style={{ marginBottom: 8, fontSize: 12, color: '#22c55e' }}>
                  <span className="social-status-dot connected" />
                  {connected.length} connected
                </div>
              )}
              {p.available ? (
                <button
                  className="social-send-btn"
                  style={{ width: '100%', padding: '8px 0' }}
                  onClick={() => { resetSetup(); setSetupPlatform(p.key) }}
                >
                  {connected.length > 0 ? 'Add Another' : 'Connect'}
                </button>
              ) : (
                <button className="social-action-btn" disabled style={{ width: '100%', padding: '8px 0', opacity: 0.5 }}>
                  Coming Soon
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Connected Accounts */}
      {accounts.length > 0 && (
        <>
          <h4 style={{ color: 'var(--admin-text)', marginTop: 32, marginBottom: 12 }}>Connected Accounts</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {accounts.map(acc => (
              <div key={acc.id} className="social-account-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={`social-platform-icon ${acc.platform}`} style={{ width: 40, height: 40, fontSize: 20, marginBottom: 0 }}>
                      {PLATFORMS.find(p => p.key === acc.platform)?.icon || '\u{1F517}'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{acc.account_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                        {acc.account_identifier}
                        {' \u2022 '}
                        <span className={`social-status-dot ${acc.status}`} />
                        {acc.status}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="social-action-btn"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => handleTestConnection(acc.id)}
                    >
                      Test
                    </button>
                    <button
                      className="social-action-btn"
                      style={{ padding: '6px 12px', fontSize: 12, color: '#ef4444' }}
                      onClick={() => handleDisconnect(acc.id)}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                {acc.error_message && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
                    Error: {acc.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Setup Wizard Modal */}
      {setupPlatform && (
        <div className="social-setup-modal" onClick={(e) => { if (e.target === e.currentTarget) resetSetup() }}>
          <div className="social-setup-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--admin-text)' }}>
                Connect {PLATFORMS.find(p => p.key === setupPlatform)?.name}
              </h3>
              <button onClick={resetSetup} style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', fontSize: 20, cursor: 'pointer' }}>
                {'\u00D7'}
              </button>
            </div>

            {setupPlatform === 'telegram' && (
              <>
                {setupStep === 1 && (
                  <div className="social-setup-step">
                    <h4>Step 1: Create a Telegram Bot</h4>
                    <div style={{ color: 'var(--admin-text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                      <p><strong>1.</strong> Open Telegram and search for <strong>@BotFather</strong></p>
                      <p><strong>2.</strong> Send <code style={{ background: 'var(--admin-bg)', padding: '2px 6px', borderRadius: 4 }}>/newbot</code></p>
                      <p><strong>3.</strong> Choose a name (e.g., "Spark AI Support")</p>
                      <p><strong>4.</strong> Choose a username (must end in <code style={{ background: 'var(--admin-bg)', padding: '2px 6px', borderRadius: 4 }}>bot</code>)</p>
                      <p><strong>5.</strong> Copy the <strong>bot token</strong> that BotFather gives you</p>
                    </div>
                    <button className="social-send-btn" style={{ width: '100%', marginTop: 16 }} onClick={() => setSetupStep(2)}>
                      I have my bot token
                    </button>
                  </div>
                )}
                {setupStep === 2 && (
                  <div className="social-setup-step">
                    <h4>Step 2: Enter Bot Details</h4>
                    <div className="social-compose-field">
                      <label>Bot Token</label>
                      <input
                        type="text"
                        value={botToken}
                        onChange={e => setBotToken(e.target.value)}
                        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                        className="social-setup-input"
                      />
                    </div>
                    <div className="social-compose-field">
                      <label>Account Name (optional)</label>
                      <input
                        type="text"
                        value={accountName}
                        onChange={e => setAccountName(e.target.value)}
                        placeholder="My Telegram Bot"
                        className="social-setup-input"
                      />
                    </div>
                    {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="social-action-btn" style={{ padding: '10px 20px' }} onClick={() => setSetupStep(1)}>
                        Back
                      </button>
                      <button className="social-send-btn" style={{ flex: 1 }} onClick={handleConnect} disabled={connecting}>
                        {connecting ? 'Connecting...' : 'Connect & Verify'}
                      </button>
                    </div>
                  </div>
                )}
                {setupStep === 3 && (
                  <div className="social-setup-step" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u2705'}</div>
                    <h4 style={{ color: '#22c55e' }}>{success}</h4>
                    <p style={{ color: 'var(--admin-text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                      Your Telegram bot is now connected. Webhook has been registered automatically.
                      Messages sent to your bot will appear in the Inbox tab.
                    </p>
                    <button className="social-send-btn" style={{ marginTop: 16 }} onClick={resetSetup}>
                      Done
                    </button>
                  </div>
                )}
              </>
            )}

            {setupPlatform === 'whatsapp' && (
              <>
                {setupStep === 1 && (
                  <div className="social-setup-step">
                    <h4>Step 1: Get Twilio Credentials</h4>
                    <div style={{ color: 'var(--admin-text-muted)', fontSize: 13, lineHeight: 1.8 }}>
                      <p><strong>1.</strong> Go to <a href="https://console.twilio.com" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Twilio Console</a></p>
                      <p><strong>2.</strong> Find your <strong>Account SID</strong> and <strong>Auth Token</strong> on the dashboard</p>
                      <p><strong>3.</strong> Go to <strong>Messaging {'>'} Senders {'>'} WhatsApp Senders</strong></p>
                      <p><strong>4.</strong> Note your <strong>WhatsApp phone number</strong> (e.g., +14155238886)</p>
                    </div>
                    <button className="social-send-btn" style={{ width: '100%', marginTop: 16 }} onClick={() => setSetupStep(2)}>
                      I have my Twilio credentials
                    </button>
                  </div>
                )}
                {setupStep === 2 && (
                  <div className="social-setup-step">
                    <h4>Step 2: Enter Twilio Details</h4>
                    <div className="social-compose-field">
                      <label>Account SID</label>
                      <input type="text" value={accountSid} onChange={e => setAccountSid(e.target.value)}
                             placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="social-setup-input" />
                    </div>
                    <div className="social-compose-field">
                      <label>Auth Token</label>
                      <input type="password" value={authToken} onChange={e => setAuthToken(e.target.value)}
                             placeholder="Your Twilio auth token" className="social-setup-input" />
                    </div>
                    <div className="social-compose-field">
                      <label>WhatsApp Phone Number</label>
                      <input type="text" value={fromNumber} onChange={e => setFromNumber(e.target.value)}
                             placeholder="+14155238886" className="social-setup-input" />
                    </div>
                    <div className="social-compose-field">
                      <label>Account Name (optional)</label>
                      <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                             placeholder="WhatsApp Business" className="social-setup-input" />
                    </div>
                    {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="social-action-btn" style={{ padding: '10px 20px' }} onClick={() => setSetupStep(1)}>Back</button>
                      <button className="social-send-btn" style={{ flex: 1 }} onClick={handleConnect} disabled={connecting}>
                        {connecting ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  </div>
                )}
                {setupStep === 3 && (
                  <div className="social-setup-step">
                    <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 16 }}>{'\u2705'}</div>
                    <h4 style={{ color: '#22c55e', textAlign: 'center' }}>{success}</h4>
                    {webhookUrl && (
                      <div style={{ marginTop: 16 }}>
                        <p style={{ color: 'var(--admin-text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                          Important: Set this webhook URL in your Twilio Console
                        </p>
                        <div style={{
                          background: 'var(--admin-bg)', padding: '10px 14px', borderRadius: 8,
                          border: '1px solid var(--admin-border)', fontSize: 12, wordBreak: 'break-all',
                          color: '#60a5fa', fontFamily: 'monospace',
                        }}>
                          {webhookUrl}
                        </div>
                        <p style={{ color: 'var(--admin-text-muted)', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                          Go to Twilio Console {'>'} Messaging {'>'} WhatsApp Senders {'>'} Your Number {'>'}
                          Set this URL as the "When a message comes in" webhook (HTTP POST).
                        </p>
                        <button
                          className="social-action-btn"
                          style={{ marginTop: 8, padding: '6px 12px', fontSize: 12 }}
                          onClick={() => { navigator.clipboard.writeText(webhookUrl); alert('Copied!') }}
                        >
                          Copy URL
                        </button>
                      </div>
                    )}
                    <button className="social-send-btn" style={{ width: '100%', marginTop: 16 }} onClick={resetSetup}>
                      Done
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
