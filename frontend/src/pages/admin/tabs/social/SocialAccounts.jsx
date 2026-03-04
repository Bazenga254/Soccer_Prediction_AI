import { useState, useEffect, useRef } from 'react'
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
    key: 'whatsapp_qr',
    name: 'WhatsApp',
    icon: '\u{1F4F1}',
    color: '#25d366',
    available: true,
    description: 'Connect WhatsApp by scanning a QR code — just like WhatsApp Web.',
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

// ─── WhatsApp QR Modal ───────────────────────────────────
function WhatsAppQRModal({ onClose, onConnected, getAuthHeaders }) {
  const [status, setStatus] = useState('loading') // loading | qr | connected | error
  const [qrImage, setQrImage] = useState(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('Starting WhatsApp service...')
  const pollRef = useRef(null)

  const poll = async () => {
    try {
      const res = await fetch('/api/admin/social/whatsapp/qr', { headers: getAuthHeaders() })
      const data = await res.json()

      if (data.status === 'connected') {
        setStatus('connected')
        setPhone(data.phone || '')
        setName(data.name || '')
        setMessage('')
        clearInterval(pollRef.current)
        onConnected()
      } else if (data.status === 'qr') {
        setStatus('qr')
        setQrImage(data.qr)
        setMessage('')
      } else if (data.status === 'loading') {
        setStatus('loading')
        setMessage(data.message || 'Generating QR code...')
      } else if (data.error) {
        setStatus('error')
        setMessage(data.error)
        clearInterval(pollRef.current)
      }
    } catch (e) {
      setStatus('error')
      setMessage('WhatsApp service not available. Please try again.')
      clearInterval(pollRef.current)
    }
  }

  useEffect(() => {
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [])

  return (
    <div className="social-setup-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="social-setup-content" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--admin-text)' }}>Connect WhatsApp</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', fontSize: 20, cursor: 'pointer' }}>
            {'\u00D7'}
          </button>
        </div>

        {status === 'connected' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{'\u2705'}</div>
            <h4 style={{ color: '#22c55e', margin: '0 0 8px' }}>WhatsApp Connected!</h4>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13, margin: '0 0 4px' }}>
              {name && <><strong>{name}</strong><br /></>}
              {phone && <span>+{phone}</span>}
            </p>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
              Messages sent to your WhatsApp will now appear in the Inbox tab in real-time.
            </p>
            <button className="social-send-btn" style={{ marginTop: 16, padding: '10px 32px' }} onClick={onClose}>
              Done
            </button>
          </div>
        ) : status === 'error' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
            <p style={{ color: '#ef4444', fontSize: 13 }}>{message}</p>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 12, lineHeight: 1.6 }}>
              Make sure the WhatsApp service is running on the server.
            </p>
            <button className="social-send-btn" style={{ marginTop: 16 }} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {status === 'loading' || !qrImage ? (
              <div style={{ padding: '40px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u23F3'}</div>
                <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>{message}</p>
                <p style={{ color: 'var(--admin-text-muted)', fontSize: 11, marginTop: 8 }}>
                  This may take up to 30 seconds...
                </p>
              </div>
            ) : (
              <>
                <div style={{
                  background: '#fff',
                  display: 'inline-block',
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 16,
                }}>
                  <img src={qrImage} alt="WhatsApp QR Code" style={{ width: 260, height: 260, display: 'block' }} />
                </div>
                <h4 style={{ color: 'var(--admin-text)', margin: '0 0 8px' }}>Scan with WhatsApp</h4>
                <p style={{ color: 'var(--admin-text-muted)', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                  1. Open <strong>WhatsApp</strong> on your phone<br />
                  2. Tap <strong>Settings</strong> {'>'} <strong>Linked Devices</strong><br />
                  3. Tap <strong>Link a Device</strong> and scan this QR code
                </p>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--admin-text-muted)' }}>
                  {'\u{1F504}'} QR code refreshes automatically
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────
export default function SocialAccounts({ accounts, onRefresh }) {
  const { getAuthHeaders } = useAdmin()
  const [setupPlatform, setSetupPlatform] = useState(null)
  const [setupStep, setSetupStep] = useState(1)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [showWAModal, setShowWAModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  // Telegram fields
  const [botToken, setBotToken] = useState('')
  const [accountName, setAccountName] = useState('')

  const resetSetup = () => {
    setSetupPlatform(null)
    setSetupStep(1)
    setError('')
    setSuccess('')
    setWebhookUrl('')
    setBotToken('')
    setAccountName('')
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
      }

      const res = await fetch('/api/admin/social/accounts/connect', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: setupPlatform, account_name: name, credentials })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSuccess(data.bot_info ? `Connected! Bot: @${data.bot_info.username}` : 'Connected successfully!')
        if (data.webhook_url) setWebhookUrl(data.webhook_url)
        setSetupStep(3)
        onRefresh()
      } else {
        setError(data.detail || data.error || 'Connection failed')
      }
    } catch {
      setError('Connection failed. Please check your credentials.')
    }
    setConnecting(false)
  }

  const handleDisconnect = async (acc) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return
    try {
      if (acc.platform === 'whatsapp_qr') {
        await fetch('/api/admin/social/whatsapp/disconnect', { method: 'POST', headers: getAuthHeaders() })
      } else {
        await fetch(`/api/admin/social/accounts/${acc.id}/disconnect`, { method: 'POST', headers: getAuthHeaders() })
      }
      onRefresh()
    } catch {}
  }

  const handleSyncChats = async () => {
    setSyncing(true)
    setSyncResult('')
    try {
      const res = await fetch('/api/admin/social/whatsapp/sync', { method: 'POST', headers: getAuthHeaders() })
      const data = await res.json()
      if (data.ok) {
        setSyncResult(`Synced ${data.synced} chats`)
        onRefresh()
        setTimeout(() => setSyncResult(''), 4000)
      } else {
        setSyncResult(data.detail || 'Sync failed')
      }
    } catch {
      setSyncResult('Sync failed')
    }
    setSyncing(false)
  }

  const handleTestConnection = async (acc) => {
    try {
      if (acc.platform === 'whatsapp_qr') {
        const res = await fetch('/api/admin/social/whatsapp/status', { headers: getAuthHeaders() })
        const data = await res.json()
        alert(data.connected ? `Connected as ${data.name} (+${data.phone})` : 'WhatsApp is not connected.')
      } else {
        const res = await fetch(`/api/admin/social/accounts/${acc.id}/status`, { headers: getAuthHeaders() })
        const data = await res.json()
        alert(data.live ? 'Connection is live and working!' : 'Connection may have issues.')
      }
    } catch { alert('Failed to test connection.') }
  }

  const getPlatformIcon = (platform) => PLATFORMS.find(p => p.key === platform)?.icon || '\u{1F517}'

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
                  <span className="social-status-dot connected" /> {connected.length} connected
                </div>
              )}
              {p.available ? (
                <button
                  className="social-send-btn"
                  style={{ width: '100%', padding: '8px 0' }}
                  onClick={() => {
                    resetSetup()
                    if (p.key === 'whatsapp_qr') {
                      setShowWAModal(true)
                    } else {
                      setSetupPlatform(p.key)
                    }
                  }}
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
                    <div className={`social-platform-icon ${acc.platform}`}
                      style={{ width: 40, height: 40, fontSize: 20, marginBottom: 0 }}>
                      {getPlatformIcon(acc.platform)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{acc.account_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                        {acc.account_identifier} {' \u2022 '}
                        <span className={`social-status-dot ${acc.status}`} />
                        {acc.status}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {acc.platform === 'whatsapp_qr' && (
                      <>
                        <button className="social-action-btn" style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={handleSyncChats} disabled={syncing}>
                          {syncing ? 'Syncing…' : 'Sync Chats'}
                        </button>
                        {syncResult && <span style={{ fontSize: 11, color: '#22c55e' }}>{syncResult}</span>}
                      </>
                    )}
                    <button className="social-action-btn" style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => handleTestConnection(acc)}>Test</button>
                    <button className="social-action-btn" style={{ padding: '6px 12px', fontSize: 12, color: '#ef4444' }}
                      onClick={() => handleDisconnect(acc)}>Disconnect</button>
                  </div>
                </div>
                {acc.error_message && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>Error: {acc.error_message}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* WhatsApp QR Modal */}
      {showWAModal && (
        <WhatsAppQRModal
          getAuthHeaders={getAuthHeaders}
          onClose={() => { setShowWAModal(false); onRefresh() }}
          onConnected={() => { onRefresh() }}
        />
      )}

      {/* Telegram Setup Modal */}
      {setupPlatform === 'telegram' && (
        <div className="social-setup-modal" onClick={(e) => { if (e.target === e.currentTarget) resetSetup() }}>
          <div className="social-setup-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--admin-text)' }}>Connect Telegram</h3>
              <button onClick={resetSetup} style={{ background: 'none', border: 'none', color: 'var(--admin-text-muted)', fontSize: 20, cursor: 'pointer' }}>
                {'\u00D7'}
              </button>
            </div>
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
                  <input type="text" value={botToken} onChange={e => setBotToken(e.target.value)}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" className="social-setup-input" />
                </div>
                <div className="social-compose-field">
                  <label>Account Name (optional)</label>
                  <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                    placeholder="My Telegram Bot" className="social-setup-input" />
                </div>
                {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="social-action-btn" style={{ padding: '10px 20px' }} onClick={() => setSetupStep(1)}>Back</button>
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
                  Your Telegram bot is connected. Messages will appear in the Inbox.
                </p>
                <button className="social-send-btn" style={{ marginTop: 16 }} onClick={resetSetup}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
