import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * AdBanner component - shows ads only to free-tier users.
 * Supports: banner, native, and interstitial formats.
 *
 * To integrate a real ad network (Adsterra, AdSense, etc.):
 * 1. Replace the placeholder div with the ad network's script/tag
 * 2. Set the ad zone IDs via props or env vars
 *
 * Props:
 *   format - 'banner' | 'native' | 'leaderboard' (default: 'banner')
 *   slot - ad slot identifier for the network
 *   className - additional CSS class
 */
export default function AdBanner({ format = 'banner', slot = '', className = '' }) {
  const { user } = useAuth()
  const adRef = useRef(null)

  // Don't show ads to pro users
  if (user?.tier === 'pro' || user?.tier === 'trial') return null

  const formatClass = `ad-${format}`

  return (
    <div className={`ad-banner-wrapper ${formatClass} ${className}`} ref={adRef}>
      <div className="ad-placeholder">
        <span className="ad-label">Advertisement</span>
        <div className="ad-content-area">
          {/*
            Replace this placeholder with actual ad code:

            Adsterra example:
            <script async src="//www.highperformanceformat.com/ZONE_ID"></script>

            Google AdSense example:
            <ins className="adsbygoogle"
              style={{ display: 'block' }}
              data-ad-client="ca-pub-XXXXXXX"
              data-ad-slot={slot}
              data-ad-format="auto"
              data-full-width-responsive="true" />
          */}
          <p className="ad-placeholder-text">
            Ad space - {format === 'leaderboard' ? '728x90' : format === 'native' ? 'Native' : '320x100'}
          </p>
        </div>
      </div>
    </div>
  )
}
