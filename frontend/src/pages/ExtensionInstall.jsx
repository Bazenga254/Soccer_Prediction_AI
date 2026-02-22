import { useState } from 'react'
import { Link } from 'react-router-dom'
import sparkLogo from '../assets/spark-ai-logo.png'

export default function ExtensionInstall() {
  const [expandedFaq, setExpandedFaq] = useState(null)

  const FEATURES = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      title: 'AI Match Predictions',
      desc: 'Get AI-powered predictions directly on betting sites while you browse.',
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
      title: 'Odds Comparison',
      desc: 'Compare odds across bookmakers without leaving your current site.',
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
      title: 'Live Goal Alerts',
      desc: 'Get desktop notifications for goals in matches you are tracking.',
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
      title: 'Secure & Private',
      desc: 'Your data stays on your device. No tracking, no ads.',
    },
  ]

  const STEPS = [
    {
      number: '1',
      title: 'Download the Extension',
      desc: 'Click the download button below to get the extension zip file.',
      detail: 'The file is about 750 KB and downloads instantly.',
    },
    {
      number: '2',
      title: 'Unzip the File',
      desc: 'Extract the downloaded zip file to a folder on your computer.',
      detail: 'Right-click the file and select "Extract All" (Windows) or double-click (Mac).',
    },
    {
      number: '3',
      title: 'Open Chrome Extensions',
      desc: <>Go to <strong style={{ color: '#f8fafc' }}>chrome://extensions</strong> in your browser.</>,
      detail: 'Type chrome://extensions in the address bar and press Enter.',
    },
    {
      number: '4',
      title: 'Enable Developer Mode',
      desc: 'Toggle the "Developer mode" switch in the top-right corner.',
      detail: 'This allows you to install extensions from local files.',
    },
    {
      number: '5',
      title: 'Load the Extension',
      desc: <>Click <strong style={{ color: '#f8fafc' }}>"Load unpacked"</strong> and select the extracted folder.</>,
      detail: 'Select the folder that contains the manifest.json file.',
    },
    {
      number: '6',
      title: 'You\'re All Set!',
      desc: 'The Spark AI icon will appear in your browser toolbar.',
      detail: 'Pin it for quick access: click the puzzle icon > pin Spark AI.',
    },
  ]

  const FAQS = [
    {
      q: 'Which browsers are supported?',
      a: 'The extension works on Chrome, Brave, Edge, and any Chromium-based browser.',
    },
    {
      q: 'Which betting sites are supported?',
      a: 'Betika, SportPesa, 1xBet, Mozzart Bet, Bet365, William Hill, Betway, DraftKings, FanDuel, and BetMGM.',
    },
    {
      q: 'Do I need a Spark AI account?',
      a: 'Yes, you need to sign in with your Spark AI account in the extension popup to use predictions.',
    },
    {
      q: 'Is it safe to install?',
      a: 'Yes. The extension only reads match data from supported betting sites. It does not modify any page content or access your betting account.',
    },
    {
      q: 'Will it update automatically?',
      a: 'Extensions installed via "Load unpacked" do not auto-update. Check back here for new versions.',
    },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
    }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src={sparkLogo} alt="Spark AI" style={{ width: 32, height: 32, borderRadius: 6 }} />
          <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 18 }}>Spark AI</span>
        </Link>
        <Link to="/" style={{
          color: '#94a3b8',
          fontSize: 14,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Home
        </Link>
      </nav>

      {/* Hero */}
      <section style={{
        textAlign: 'center',
        padding: '48px 24px 40px',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 20,
          padding: '6px 16px',
          marginBottom: 24,
          fontSize: 13,
          color: '#93c5fd',
          fontWeight: 600,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Chrome Extension v1.0
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 800,
          color: '#f8fafc',
          lineHeight: 1.2,
          marginBottom: 16,
        }}>
          Spark AI for Chrome
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2.5vw, 18px)',
          color: '#94a3b8',
          lineHeight: 1.6,
          maxWidth: 560,
          margin: '0 auto 32px',
        }}>
          Get AI-powered match predictions and live alerts directly on your favorite betting sites.
        </p>
        <a
          href="/spark-ai-extension.zip"
          download="spark-ai-extension.zip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            padding: '14px 32px',
            borderRadius: 12,
            textDecoration: 'none',
            transition: 'all 0.2s',
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Extension (.zip)
        </a>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
          ~750 KB &middot; Works on Chrome, Brave, Edge
        </p>
      </section>

      {/* Features Grid */}
      <section style={{
        padding: '32px 24px 48px',
        maxWidth: 900,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: '20px 18px',
              border: '1px solid #334155',
            }}>
              <div style={{ marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Installation Steps */}
      <section style={{
        padding: '48px 24px',
        maxWidth: 720,
        margin: '0 auto',
      }}>
        <h2 style={{
          fontSize: 'clamp(22px, 4vw, 32px)',
          fontWeight: 800,
          color: '#f8fafc',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          How to Install
        </h2>
        <p style={{
          color: '#94a3b8',
          textAlign: 'center',
          marginBottom: 40,
          fontSize: 15,
        }}>
          Follow these steps to install the extension manually
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 20 }}>
              {/* Timeline */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: i === STEPS.length - 1 ? '#22c55e' : '#3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#fff',
                  flexShrink: 0,
                }}>
                  {i === STEPS.length - 1 ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : step.number}
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 2,
                    flex: 1,
                    background: '#334155',
                    minHeight: 24,
                  }} />
                )}
              </div>
              {/* Content */}
              <div style={{ paddingBottom: i < STEPS.length - 1 ? 28 : 0 }}>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#f8fafc',
                  marginBottom: 4,
                  lineHeight: '36px',
                }}>{step.title}</h3>
                <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 4 }}>{step.desc}</p>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Download again CTA */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <a
            href="/spark-ai-extension.zip"
            download="spark-ai-extension.zip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              padding: '12px 28px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Extension
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section style={{
        padding: '48px 24px 64px',
        maxWidth: 640,
        margin: '0 auto',
      }}>
        <h2 style={{
          fontSize: 'clamp(20px, 3.5vw, 28px)',
          fontWeight: 800,
          color: '#f8fafc',
          textAlign: 'center',
          marginBottom: 32,
        }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FAQS.map((faq, i) => (
            <div
              key={i}
              style={{
                background: '#1e293b',
                borderRadius: 10,
                border: '1px solid #334155',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'none',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: 'inherit',
                }}
              >
                {faq.q}
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    transition: 'transform 0.2s',
                    transform: expandedFaq === i ? 'rotate(180deg)' : 'rotate(0)',
                    flexShrink: 0,
                  }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {expandedFaq === i && (
                <div style={{
                  padding: '0 20px 16px',
                  fontSize: 14,
                  color: '#94a3b8',
                  lineHeight: 1.6,
                }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '24px',
        borderTop: '1px solid #1e293b',
        color: '#475569',
        fontSize: 13,
      }}>
        <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>
          &larr; Back to Spark AI
        </Link>
      </footer>
    </div>
  )
}
