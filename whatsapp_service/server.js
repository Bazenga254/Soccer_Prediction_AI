/**
 * WhatsApp Web Bridge Service
 * Uses whatsapp-web.js to connect via QR code scan (like WhatsApp Web)
 * Runs on port 3002, communicates with FastAPI backend
 */

const express = require('express')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const QRCode = require('qrcode')
const axios = require('axios')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())

const PORT = 3002
const FASTAPI_URL = 'http://127.0.0.1:8001'
const CHROMIUM_PATH = '/usr/bin/chromium-browser'

// State
let currentQR = null
let qrDataUrl = null
let clientReady = false
let clientPhone = ''
let clientName = ''
let initError = null
let client = null

// ─── Init WhatsApp Client ─────────────────────────────────

function createClient() {
  const authPath = path.join(__dirname, '.wwebjs_auth')

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  })

  client.on('qr', async (qr) => {
    console.log('[WhatsApp] QR code generated — scan with your phone')
    currentQR = qr
    clientReady = false
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 })
    } catch (e) {
      console.error('[WhatsApp] QR generation error:', e.message)
    }
  })

  client.on('ready', async () => {
    console.log('[WhatsApp] Client ready ✅')
    currentQR = null
    qrDataUrl = null
    clientReady = true
    initError = null
    try {
      const info = client.info
      clientPhone = info?.wid?.user || ''
      clientName = info?.pushname || ''
      console.log(`[WhatsApp] Connected as ${clientName} (+${clientPhone})`)
      // Notify FastAPI that WhatsApp is connected
      await axios.post(`${FASTAPI_URL}/api/internal/whatsapp/connected`, {
        phone: clientPhone,
        name: clientName,
      }).catch(() => {})
    } catch (e) {}
  })

  client.on('authenticated', () => {
    console.log('[WhatsApp] Authenticated ✅')
  })

  client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Auth failure:', msg)
    initError = `Auth failed: ${msg}`
    clientReady = false
  })

  client.on('disconnected', (reason) => {
    console.log('[WhatsApp] Disconnected:', reason)
    clientReady = false
    clientPhone = ''
    clientName = ''
    // Notify FastAPI
    axios.post(`${FASTAPI_URL}/api/internal/whatsapp/disconnected`, { reason }).catch(() => {})
    // Auto-restart after 5 seconds
    setTimeout(() => {
      console.log('[WhatsApp] Restarting client...')
      createClient()
    }, 5000)
  })

  // Shared handler for both incoming and outgoing messages
  async function handleMessage(msg) {
    try {
      // Skip status updates, notifications
      if (msg.type === 'e2e_notification' || msg.type === 'notification_template') return
      // Skip reactions (they aren't real chat messages)
      if (msg.type === 'reaction') return

      console.log(`[WhatsApp] ${msg.fromMe ? 'OUT' : 'IN'} msg from ${msg.from}: "${(msg.body || '').substring(0, 60)}"`)

      const contact = await msg.getContact()
      const chat = await msg.getChat()

      let mediaUrl = null
      let mediaType = 'text'
      let mediaFilename = null

      // Download media if present
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia()
          if (media) {
            const mediaRes = await axios.post(`${FASTAPI_URL}/api/internal/whatsapp/store-media`, {
              data: media.data,
              mimetype: media.mimetype,
              filename: media.filename || `wa_${Date.now()}`,
            })
            mediaUrl = mediaRes.data?.url || null
            mediaFilename = media.filename
            if (media.mimetype?.startsWith('image/')) mediaType = 'image'
            else if (media.mimetype?.startsWith('video/')) mediaType = 'video'
            else if (media.mimetype?.startsWith('audio/')) mediaType = 'audio'
            else mediaType = 'document'
          }
        } catch (e) {
          console.error('[WhatsApp] Media download error:', e.message)
        }
      }

      const payload = {
        from: msg.from,
        from_name: contact.pushname || contact.name || msg.from.split('@')[0],
        chat_id: chat.id._serialized,
        chat_name: chat.name || '',
        is_group: chat.isGroup,
        body: msg.body || '',
        type: msg.type,
        from_me: msg.fromMe,
        media_url: mediaUrl,
        media_type: mediaType,
        media_filename: mediaFilename,
        timestamp: msg.timestamp,
        message_id: msg.id._serialized,
      }

      await axios.post(`${FASTAPI_URL}/api/internal/whatsapp/message`, payload)
    } catch (e) {
      console.error('[WhatsApp] Message handler error:', e.message)
    }
  }

  // Incoming messages from others
  client.on('message', handleMessage)

  // Messages sent from the phone (so inbox stays in sync)
  client.on('message_create', async (msg) => {
    if (msg.fromMe) await handleMessage(msg)
  })

  client.initialize().catch(e => {
    console.error('[WhatsApp] Initialize error:', e.message)
    initError = e.message
  })
}

// ─── API Routes ───────────────────────────────────────────

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, ready: clientReady, phone: clientPhone, name: clientName })
})

// Status
app.get('/status', (req, res) => {
  res.json({
    connected: clientReady,
    phone: clientPhone,
    name: clientName,
    has_qr: !!qrDataUrl,
    error: initError,
  })
})

// Get QR code
app.get('/qr', (req, res) => {
  if (clientReady) {
    return res.json({ status: 'connected', phone: clientPhone, name: clientName })
  }
  if (!qrDataUrl) {
    return res.json({ status: 'loading', message: 'Generating QR code, please wait...' })
  }
  res.json({ status: 'qr', qr: qrDataUrl })
})

// Send text message
app.post('/send', async (req, res) => {
  const { to, text } = req.body
  if (!clientReady) return res.status(503).json({ ok: false, error: 'WhatsApp not connected' })
  if (!to || !text) return res.status(400).json({ ok: false, error: 'Missing to or text' })
  try {
    // Format number: ensure it ends with @c.us or @g.us
    const chatId = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@c.us`
    const msg = await client.sendMessage(chatId, text)
    res.json({ ok: true, message_id: msg.id._serialized })
  } catch (e) {
    console.error('[WhatsApp] Send error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Send media
app.post('/send-media', async (req, res) => {
  const { to, url, caption, filename } = req.body
  if (!clientReady) return res.status(503).json({ ok: false, error: 'WhatsApp not connected' })
  if (!to || !url) return res.status(400).json({ ok: false, error: 'Missing to or url' })
  try {
    const chatId = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@c.us`
    const media = await MessageMedia.fromUrl(url, { unsafeMime: true })
    if (filename) media.filename = filename
    const msg = await client.sendMessage(chatId, media, { caption: caption || '' })
    res.json({ ok: true, message_id: msg.id._serialized })
  } catch (e) {
    console.error('[WhatsApp] Send media error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Get all chats (for sync)
app.get('/chats', async (req, res) => {
  if (!clientReady) return res.status(503).json({ ok: false, error: 'WhatsApp not connected' })
  try {
    const chats = await client.getChats()
    const result = chats.slice(0, 100).map(chat => {
      const lm = chat.lastMessage
      return {
        chat_id: chat.id._serialized,
        name: chat.name || chat.id._serialized.split('@')[0],
        is_group: chat.isGroup,
        unread_count: chat.unreadCount || 0,
        last_message: lm ? {
          body: lm.body || '',
          timestamp: lm.timestamp,
          from_me: lm.fromMe,
          type: lm.type,
        } : null,
      }
    })
    res.json({ ok: true, chats: result })
  } catch (e) {
    console.error('[WhatsApp] Get chats error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Disconnect + clear session
app.post('/disconnect', async (req, res) => {
  try {
    if (client) {
      await client.logout()
      await client.destroy()
    }
    // Clear auth files
    const authPath = path.join(__dirname, '.wwebjs_auth')
    if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true })
    clientReady = false
    clientPhone = ''
    clientName = ''
    currentQR = null
    qrDataUrl = null
    res.json({ ok: true })
    // Restart fresh
    setTimeout(() => createClient(), 2000)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Start ────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[WhatsApp Service] Running on http://127.0.0.1:${PORT}`)
  createClient()
})
