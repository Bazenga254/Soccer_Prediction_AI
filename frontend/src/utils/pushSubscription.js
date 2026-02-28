/**
 * Push subscription utilities for Web Push API.
 */
import axios from 'axios'

/**
 * Convert a base64 URL-safe string to a Uint8Array.
 * Needed to convert the VAPID public key for PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Subscribe the browser to Web Push notifications.
 * 1. Fetch VAPID public key from server
 * 2. Subscribe via PushManager
 * 3. Send subscription to server
 */
export async function subscribeToPush() {
  try {
    // Wait for service worker registration
    const registration = window.__swRegistration
      || await navigator.serviceWorker.ready

    if (!registration || !registration.pushManager) {
      console.warn('[Push] PushManager not available')
      return false
    }

    // Check if already subscribed
    const existingSub = await registration.pushManager.getSubscription()
    if (existingSub) {
      // Re-send to server in case it was lost
      await sendSubscriptionToServer(existingSub)
      return true
    }

    // Fetch VAPID public key from server
    const { data } = await axios.get('/api/push/vapid-key')
    if (!data.vapid_public_key) {
      console.warn('[Push] No VAPID key configured on server')
      return false
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.vapid_public_key),
    })

    // Send subscription to server
    await sendSubscriptionToServer(subscription)
    return true
  } catch (err) {
    console.error('[Push] Subscription failed:', err)
    return false
  }
}

/**
 * Send the PushSubscription object to the backend.
 */
async function sendSubscriptionToServer(subscription) {
  try {
    await axios.post('/api/push/subscribe', {
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
    })
  } catch (err) {
    console.error('[Push] Failed to send subscription to server:', err)
  }
}

/**
 * Unsubscribe from Web Push notifications.
 */
export async function unsubscribeFromPush() {
  try {
    const registration = window.__swRegistration
      || await navigator.serviceWorker.ready

    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await axios.post('/api/push/unsubscribe', { endpoint })
    }
    return true
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err)
    return false
  }
}
