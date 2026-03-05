/**
 * Spark AI - Content Script
 * Detects soccer matches on betting sites and injects AI analysis buttons
 * below each supported betting market section (1×2, Double Chance, BTTS, Total).
 * Uses Shadow DOM cards for CSS-isolated inline analysis display.
 */

(async function sparkAIInit() {
  console.log("[Spark AI] Content script loaded on", window.location.href);

  let auth;
  try {
    auth = await chrome.runtime.sendMessage({ type: "CHECK_AUTH" });
    console.log("[Spark AI] CHECK_AUTH response:", JSON.stringify(auth)?.substring(0, 200));
  } catch (e) {
    console.error("[Spark AI] CHECK_AUTH failed:", e.message);
    return;
  }

  if (!auth?.authenticated || !auth?.is_pro) {
    console.log("[Spark AI] Not active — user not authenticated or not pro. Auth:", JSON.stringify(auth)?.substring(0, 200));
    return;
  }

  console.log("[Spark AI] Pro user detected. Initializing...");

  // Check if extension is enabled (toggle state)
  let sparkEnabled = true;
  try {
    const toggleState = await chrome.runtime.sendMessage({ type: "GET_TOGGLE_STATE" });
    sparkEnabled = toggleState?.enabled !== false; // default true
  } catch (e) {
    // Default to enabled if can't reach service worker
  }

  if (!sparkEnabled) {
    console.log("[Spark AI] Extension is toggled OFF by user. Buttons hidden until toggled on.");
  }

  // Listen for live score updates and toggle messages from service worker/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "LIVE_SCORE_UPDATE") {
      if (!sparkEnabled) return false;
      updateLiveScoreBadges(message.tracked);
      if (typeof SparkAnalysisPanel !== "undefined" && SparkAnalysisPanel.updatePanelLiveScore) {
        SparkAnalysisPanel.updatePanelLiveScore(message.tracked);
      }
      sendResponse({ received: true });
    }
    if (message.type === "SPARK_TOGGLE") {
      sparkEnabled = message.enabled;
      console.log("[Spark AI] Toggle:", sparkEnabled ? "ON" : "OFF");
      if (sparkEnabled) {
        // Re-show all hidden spark elements
        document.querySelectorAll(".spark-ai-btn, .spark-track-btn, .spark-live-score-badge, .spark-market-btn-wrap, .spark-market-card-host, .spark-team-selector").forEach(el => {
          el.style.display = "";
        });
        // Trigger a fresh scan to pick up any new matches
        if (window._sparkDetector) window._sparkDetector.scan();
      } else {
        // Hide all spark elements from the page
        document.querySelectorAll(".spark-ai-btn, .spark-track-btn, .spark-live-score-badge, .spark-market-btn-wrap, .spark-market-card-host, .spark-team-selector").forEach(el => {
          el.style.display = "none";
        });
        // Also hide the analysis panel if open
        if (typeof SparkAnalysisPanel !== "undefined") SparkAnalysisPanel.hide();
      }
      sendResponse({ received: true });
    }
    return false;
  });

  // Restore tracked matches state for badge initialization
  try {
    const liveResp = await chrome.runtime.sendMessage({ type: "GET_TRACKED_MATCHES" });
    if (liveResp?.tracked) {
      window._sparkTrackedMatches = liveResp.tracked;
      console.log("[Spark AI] Restored", Object.keys(liveResp.tracked).length, "tracked match(es)");
    }
  } catch (e) {
    console.warn("[Spark AI] Could not fetch tracked matches:", e);
  }

  const hostname = window.location.hostname.toLowerCase();
  const SITES = [
    { key: "betika", match: "betika.com" },
    { key: "sportpesa", match: "sportpesa.com" },
    { key: "1xbet", match: "1xbet" },
    { key: "mozzartbet", match: "mozzartbet" },
    { key: "bet365", match: "bet365.com" },
    { key: "williamhill", match: "williamhill.com" },
    { key: "betway", match: "betway" },
    { key: "draftkings", match: "draftkings.com" },
    { key: "fanduel", match: "fanduel.com" },
    { key: "betmgm", match: "betmgm.com" },
  ];

  const site = SITES.find(s => hostname.includes(s.match));
  if (!site) return;

  console.log(`[Spark AI] Active on ${site.key}. Scanning for markets...`);

  // Use window-level reference so message listener can access it
  const detector = new SparkMarketDetector(site.key);
  window._sparkDetector = detector;

  // Track injected button count to detect SPA re-renders that destroy our elements
  let prevBtnCount = 0;

  function checkAndRescan() {
    if (!sparkEnabled) return; // Skip scanning when extension is toggled off
    const currentBtnCount = document.querySelectorAll('.spark-ai-btn').length;
    if (prevBtnCount > 0 && currentBtnCount === 0) {
      console.log("[Spark AI] Buttons removed from DOM (SPA re-render detected), rescanning...");
      detector.processedListings = new WeakSet();
      document.querySelectorAll("[data-spark-listing]").forEach(el => el.removeAttribute("data-spark-listing"));
    }
    prevBtnCount = currentBtnCount;
    detector.scan();
    // Update count after scan (buttons may have been injected)
    prevBtnCount = document.querySelectorAll('.spark-ai-btn').length;
  }

  // Periodic scanning for SPA-rendered content
  // Phase 1: Fast scans (10 × 2s) for initial injection
  // Phase 2: Maintenance scans (every 5s) to recover from SPA re-renders
  let scanCount = 0;
  const fastScanInterval = setInterval(() => {
    scanCount++;
    checkAndRescan();
    if (scanCount >= 10) {
      clearInterval(fastScanInterval);
      // Phase 2: Continue with slower maintenance scans indefinitely
      setInterval(() => checkAndRescan(), 5000);
    }
  }, 2000);

  // Observe DOM mutations (debounced via scheduleScan)
  const observer = new MutationObserver((mutations) => {
    if (!sparkEnabled) return; // Skip when extension is toggled off
    // Only rescan on meaningful changes (new nodes), not attribute/text tweaks
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasNewNodes) {
      // Check if our buttons were removed in this mutation batch
      const btns = document.querySelectorAll('.spark-ai-btn').length;
      if (prevBtnCount > 0 && btns === 0) {
        // Buttons destroyed — react faster (500ms instead of 1500ms)
        detector.processedListings = new WeakSet();
        document.querySelectorAll("[data-spark-listing]").forEach(el => el.removeAttribute("data-spark-listing"));
        if (detector.scanTimer) clearTimeout(detector.scanTimer);
        detector.scanTimer = setTimeout(() => {
          checkAndRescan();
        }, 500);
      } else {
        detector.scheduleScan();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA URL navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log("[Spark AI] URL changed, rescanning...");
      detector.reset();
      prevBtnCount = 0;
      detector.scan();
    }
  }, 1000);

  // Virtual scroll re-scan
  let scrollDebounce;
  window.addEventListener("scroll", () => {
    if (scrollDebounce) clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => detector.scan(), 800);
  }, { passive: true });
})();


// ═══════════════════════════════════════════════════════════════
// MARKET DETECTOR — finds market sections and injects AI buttons
// ═══════════════════════════════════════════════════════════════

class SparkMarketDetector {
  constructor(siteKey) {
    this.siteKey = siteKey;
    this.currentMatch = null;
    this.predictionCache = null;
    this.predictionPromise = null;
    this.processedMarkets = new WeakSet();
    this.processedListings = new WeakSet();
    this.scanTimer = null;
    this.activeCards = new Map();
  }

  // Markets we support with their header text patterns
  static MARKETS = [
    {
      type: "1x2",
      label: "Match Result (1×2)",
      patterns: [
        /^\s*1\s*[x×]\s*2\s*$/i,
        /^\s*match\s*result\s*$/i,
        /^\s*full\s*time\s*result\s*$/i,
        /^\s*1x2\s*$/i,
        /^\s*ft\s*result\s*$/i,
      ],
    },
    {
      type: "double_chance",
      label: "Double Chance",
      patterns: [/double\s*chance/i],
    },
    {
      type: "btts",
      label: "Both Teams to Score",
      patterns: [
        /both\s*teams?\s*to\s*score/i,
        /^\s*gg\s*[\/|]\s*ng\s*$/i,
        /^\s*btts\s*$/i,
      ],
    },
    {
      type: "over_under",
      label: "Total Goals",
      patterns: [
        /^\s*total\s*$/i,
        /^\s*totals?\s*$/i,
        /^\s*total\s*goals?\s*$/i,
        /over\s*[\/|]\s*under/i,
        /^\s*total\s*\(/i,
      ],
    },
  ];

  scheduleScan() {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scan(), 1500);
  }

  reset() {
    this.processedMarkets = new WeakSet();
    this.processedListings = new WeakSet();
    this.predictionCache = null;
    this.predictionPromise = null;
    this.currentMatch = null;
    document.querySelectorAll(".spark-market-btn-wrap, .spark-market-card-host").forEach(el => el.remove());
    document.querySelectorAll("[data-spark-listing]").forEach(el => el.removeAttribute("data-spark-listing"));
    this.activeCards.clear();
  }

  scan() {
    // Detect match teams
    const matchInfo = this.detectMatch();
    if (matchInfo?.homeTeam && matchInfo?.awayTeam) {
      if (!this.currentMatch ||
          this.currentMatch.homeTeam !== matchInfo.homeTeam ||
          this.currentMatch.awayTeam !== matchInfo.awayTeam) {
        this.currentMatch = matchInfo;
        this.predictionCache = null;
        this.predictionPromise = null;
        this.activeCards.clear();
        console.log(`[Spark AI] Match detected: ${matchInfo.homeTeam} vs ${matchInfo.awayTeam}`);
      }
    }

    // Only inject per-market buttons on match detail pages
    // (match detected from URL, title, meta, or heading — not from generic page text)
    if (this.currentMatch && /^(url|title|meta|heading)$/.test(this.currentMatch.source)) {
      this.scanMarketSections();
    }

    // Also handle match listing pages
    this.scanMatchListings();
  }


  // ─── MATCH DETECTION ──────────────────────────────────────

  detectMatch() {
    return this.extractFromURL() ||
           this.extractFromTitle() ||
           this.extractFromMetaTags() ||
           this.extractFromHeadings() ||
           this.extractFromSeparateElements() ||
           this.extractFromPageText();
  }

  extractFromURL() {
    const path = decodeURIComponent(window.location.pathname).toLowerCase();
    const vsPattern = path.match(/\/([a-z0-9][a-z0-9\-]+)-(?:vs?|versus)-([a-z0-9][a-z0-9\-]+?)(?:\/|$|\?)/);
    if (vsPattern) {
      const home = this.slugToName(vsPattern[1]);
      const away = this.slugToName(vsPattern[2]);
      if (home.length > 2 && away.length > 2) {
        return { homeTeam: home, awayTeam: away, competition: this.guessCompetition(), source: "url" };
      }
    }
    return null;
  }

  extractFromTitle() {
    const m = this.parseTeamsFromText(document.title);
    if (m) return { ...m, source: "title" };
    return null;
  }

  /** Check og:title and twitter:title meta tags — betting sites often have clean "Team A vs Team B" here */
  extractFromMetaTags() {
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[name="description"]', 'meta[property="og:description"]']) {
      const content = document.querySelector(selector)?.content;
      if (content) {
        const m = this.parseTeamsFromText(content);
        if (m) return { ...m, source: "meta" };
      }
    }
    return null;
  }

  extractFromHeadings() {
    for (const h of document.querySelectorAll("h1, h2, h3, [role='heading']")) {
      const m = this.parseTeamsFromText(h.textContent.trim());
      if (m) return { ...m, source: "heading" };
    }
    return null;
  }

  /** Detect teams in separate DOM elements (common in React SPAs like Betika) */
  extractFromSeparateElements() {
    // Words/patterns that are clearly NOT team names
    const junkPattern = /^(?:statistics|stats|score|scoreboard|odds|result|line-?ups?|lineups?|events?|standings?|table|summary|details?|markets?|bets?|data|info|live|match|time|date|status|goal|half|full|total|over|under|handicap|h2h|head\s*to\s*head|form|recent|preview|analysis|predictions?|tips?|picks?|ft|ht|1st|2nd|home|away|draw|won|lost|played|points|pos|gf|ga|gd|w|d|l|all|popular|top|new|search|login|register|sign\s*up|sign\s*in|menu|settings|help|faq|about|contact|more|less|show|hide|close|open|back|next|prev|previous|share|chat|comments?|highlights|upcoming|countries|featured|trending|results|schedule|calendar|today|tomorrow|filters?|quick-?e|jackpot|virtuals?|casino|promotions?|bonuses?|deposit|withdraw|account|profile|history|my\s*bets?|football|soccer|betting|games?|sports?|leagues?|fixtures?|pre-?match|in-?play|aviator|basketball|tennis|rugby|cricket|baseball|hockey|esports?|lucky\s*numbers?|crash|specials?|multi-?bet|booked?|en|fr|de|es|pt|it|ru|sw|ar|zh|ja|ko|hi|kes|usd|eur|gbp|ngn|tzs|ugx|zar|brl|cny|jpy|inr|rub|try|mxn|aud|cad|nzd|chf|sek|nok|dkk|pln|czk|huf)$/i;
    // Broader check: reject any string that CONTAINS betting/navigation terms (catches "Football Betting Odds")
    const bettingTermsPattern = /\b(?:betting|wagering|sportsbook|odds\b.*\b(?:football|soccer|basketball|tennis|games)|(?:football|soccer|basketball|tennis)\b.*\b(?:betting|odds|games)|betting\s+odds|live\s+scores?|match\s+results?|upcoming\s+(?:matches|events|games)|pre-?match|in-?play)\b/i;
    const scorePattern = /^\d+[:\-]\d+$/;  // "0:0", "1-2", etc.
    // League/country breadcrumb patterns — NOT team names
    const leaguePattern = /(?:premier\s*league|la\s*liga|bundesliga|serie\s*a|ligue\s*1|champions\s*league|europa\s*league|conference\s*league|super\s*league|first\s*division|cup|trophy|shield)/i;
    const countryPattern = /^(?:england|spain|germany|italy|france|kenya|brazil|argentina|portugal|netherlands|scotland|turkey|greece|belgium|austria|switzerland|norway|sweden|denmark|usa|mexico|japan|australia|south\s*africa|nigeria|ghana|egypt)/i;

    const containers = document.querySelectorAll(
      "[class*='team'], [class*='Team'], [class*='match'], [class*='Match'], " +
      "[class*='event'], [class*='Event'], [class*='header'], [class*='Header'], " +
      "[class*='fixture'], [class*='Fixture'], [class*='competitor'], [class*='Competitor'], " +
      "[class*='offer'], [class*='Offer'], [class*='pair'], [class*='Pair'], " +
      "[class*='participant'], [class*='Participant']"
    );

    for (const container of containers) {
      // Skip our own injected elements
      if (container.closest(".spark-market-btn-wrap, .spark-market-card-host, .spark-ai-btn, #spark-ai-panel-host")) continue;
      if (container.className?.includes?.("spark-")) continue;

      const rect = container.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 30 || rect.height > 200) continue;

      // Collect text nodes from children, filtering out junk
      const textNodes = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (t.length >= 3 && t.length <= 40
            && !/^\d+$/.test(t)               // pure numbers
            && !/^\d+\.\d+$/.test(t)           // odds like "1.55"
            && !/^[vV][sS]?\.?$/.test(t)      // "vs", "v"
            && !/^\+\d+/.test(t)               // "+90 Markets"
            && !scorePattern.test(t)            // "0:0", "1-2"
            && !junkPattern.test(t)             // UI labels
            && !bettingTermsPattern.test(t)    // multi-word betting phrases
            && !leaguePattern.test(t)           // league names
            && !countryPattern.test(t)          // country names
            && /[a-zA-Z]{3,}/.test(t)          // must contain 3+ consecutive letters
            && !t.includes(",")                // breadcrumbs like "England, Premier League"
        ) {
          textNodes.push(t);
        }
      }

      if (textNodes.length >= 2 && textNodes.length <= 6) {
        // Try combining all text
        const combined = textNodes.join(" ");
        const m = this.parseTeamsFromText(combined);
        if (m) return m;

        // Try first and last meaningful entries as home/away
        const filtered = textNodes.filter(t =>
          !/^(?:vs?\.?|versus|-|at|@|\|)$/i.test(t) &&
          !junkPattern.test(t) &&
          !scorePattern.test(t) &&
          !leaguePattern.test(t) &&
          !countryPattern.test(t)
        );
        if (filtered.length >= 2 && filtered[0] !== filtered[filtered.length - 1] &&
            filtered[0].length >= 3 && filtered[filtered.length - 1].length >= 3) {
          return {
            homeTeam: filtered[0],
            awayTeam: filtered[filtered.length - 1],
            competition: this.guessCompetition(),
            source: "elements"
          };
        }
      }
    }
    return null;
  }

  extractFromPageText() {
    const allEls = document.querySelectorAll(
      "[class*='team'], [class*='Team'], [class*='match'], [class*='Match'], " +
      "[class*='event'], [class*='Event'], [class*='fixture'], [class*='Fixture'], " +
      "[class*='competitor'], [class*='participant'], [class*='header'], " +
      "[data-testid], div, span, p, a, td, li"
    );
    const checked = new Set();
    for (const el of allEls) {
      if (checked.has(el)) continue;
      checked.add(el);
      // Skip our own injected elements
      if (el.closest(".spark-market-btn-wrap, .spark-market-card-host, .spark-ai-btn, #spark-ai-panel-host")) continue;
      if (el.className?.includes?.("spark-")) continue;
      const text = el.textContent.trim();
      if (text.length < 5 || text.length > 200) continue;
      const m = this.parseTeamsFromText(text);
      if (m) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return m;
      }
      if (checked.size > 500) break;
    }
    return null;
  }

  parseTeamsFromText(text) {
    if (!text || text.length < 5) return null;
    const patterns = [
      // "vs" / "versus" separators
      /^(.{2,40}?)\s+(?:vs?\.?|versus)\s+(.{2,40})$/im,
      /^(.{2,40}?)\s+(?:vs?\.?|versus)\s+(.{2,40})/im,
      /(.{2,40}?)\s+(?:vs?\.?|versus)\s+(.{2,40}?)(?:\s*[-|]|$)/im,
      // Dash / en-dash / em-dash separators (e.g., "Atl.Madrid - Espanyol" on Mozzart Bet)
      /^(.{2,40}?)\s+[-\u2013\u2014]\s+(.{2,40})$/im,
      /^(.{2,40}?)\s+[-\u2013\u2014]\s+(.{2,40})/im,
    ];
    // Words that are clearly not team names (exact match)
    const junkWords = /^(?:statistics|stats|score|scoreboard|odds|result|line-?ups?|lineups?|events?|standings?|table|summary|details?|markets?|bets?|data|info|live|match|time|date|status|goal|half|full|total|over|under|handicap|highlights|upcoming|countries|featured|trending|filters?|quick-?e|jackpot|virtuals?|casino|promotions?|schedule|calendar|today|tomorrow|football|soccer|betting|games?|sports?|leagues?|fixtures?|pre-?match|in-?play|aviator|basketball|tennis|rugby|cricket|baseball|hockey|esports?|specials?|booked?|en|fr|de|es|pt|it|ru|sw|ar|zh|ja|ko|hi|kes|usd|eur|gbp|ngn|tzs|ugx|zar|brl|cny|jpy|inr|rub|try|mxn|aud|cad|nzd|chf|sek|nok|dkk|pln|czk|huf|hrk|ron|bgn|bob|cop|pen|clp|ars|vnd|thb|myr|idr|php|sgd|hkd|twd|krw|aed|\d[\d:.\-]*\d?)$/i;
    // Reject team names that contain betting/navigation terms (catches "Football Betting Odds")
    const notTeamPattern = /\b(?:betting|wagering|sportsbook|odds|football|soccer|basketball|tennis|rugby|cricket|baseball|hockey|esports?|games?\b.*\b(?:live|all|today|betting)|live\s+scores?|match\s+results?|pre-?match|in-?play|lucky\s*numbers?)\b/i;

    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const home = m[1].trim()
          .replace(/^\d+[\.\s]+/, "")           // "1. Team" → "Team"
          .replace(/^\d{1,2}:\d{2}\s+/, "")     // "23:00 Team" → "Team"
          .replace(/^\d{1,2}[\/\-]\d{1,2}\s+/, "") // "21/02 Team" → "Team"
          .replace(/[|•·].*$/, "")
          .trim();
        const away = m[2].trim()
          .replace(/\s*\d+[:\-]\d+.*$/, "")     // trim score suffix "1-2..."
          .replace(/\s+\d+\.\d+.*$/, "")         // trim odds suffix "1.55 3.20..."
          .replace(/\s+\+\d+.*$/, "")            // trim "+90 Markets..."
          .replace(/[|•·].*$/, "")
          .trim();
        if (home.length >= 3 && away.length >= 3 && home.length <= 40 && away.length <= 40) {
          // Reject if either "team" is a junk word, purely numeric, or a score like "0:0"
          if (junkWords.test(home) || junkWords.test(away)) continue;
          if (notTeamPattern.test(home) || notTeamPattern.test(away)) continue;
          if (/^\d+$/.test(home) || /^\d+$/.test(away)) continue;
          return { homeTeam: home, awayTeam: away, competition: this.guessCompetition(), source: "text" };
        }
      }
    }
    return null;
  }

  slugToName(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  guessCompetition() {
    const path = window.location.pathname.toLowerCase();
    const map = {
      "premier-league": "PL", "english-premier": "PL", "epl": "PL",
      "la-liga": "PD", "laliga": "PD", "bundesliga": "BL1",
      "serie-a": "SA", "serie_a": "SA", "ligue-1": "FL1", "ligue1": "FL1",
      "champions-league": "CL", "ucl": "CL", "europa-league": "EL",
      "kenyan-premier": "KPL",
    };
    for (const [key, code] of Object.entries(map)) {
      if (path.includes(key)) return code;
    }
    return "";
  }


  // ─── MARKET SECTION SCANNING ──────────────────────────────

  scanMarketSections() {
    // Skip if we already injected buttons for all supported markets
    const injectedTypes = new Set(
      Array.from(document.querySelectorAll(".spark-market-btn-wrap [data-market]"))
        .map(b => b.getAttribute("data-market"))
    );
    if (injectedTypes.size >= SparkMarketDetector.MARKETS.length) return;

    const els = document.querySelectorAll(
      "span, div, p, h1, h2, h3, h4, h5, h6, button, a, " +
      "[class*='market'], [class*='Market'], [class*='bet-type'], " +
      "[class*='category'], [class*='Category'], [class*='tab'], " +
      "[class*='header'], [class*='Header'], [class*='title'], [class*='Title'], " +
      "[role='heading']"
    );

    for (const el of els) {
      if (this.processedMarkets.has(el)) continue;

      const text = this.getShortText(el);
      if (text.length < 1 || text.length > 60) continue;

      for (const market of SparkMarketDetector.MARKETS) {
        if (market.patterns.some(p => p.test(text))) {
          this.processedMarkets.add(el);

          // Skip if a button for this market type already exists anywhere on the page
          if (document.querySelector(`.spark-market-btn-wrap [data-market="${market.type}"]`)) break;

          const container = this.findMarketContainer(el);
          if (!container) break;

          // Skip if container or any ancestor already has a spark button nearby
          if (container.hasAttribute("data-spark-market")) break;
          if (container.querySelector(".spark-market-btn-wrap")) break;
          if (container.nextElementSibling?.classList?.contains("spark-market-btn-wrap")) break;

          this.injectMarketButton(container, market);
          container.setAttribute("data-spark-market", market.type);
          break;
        }
      }
    }
  }

  /** Get text content suitable for market header matching */
  getShortText(el) {
    // First try direct text nodes only
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    if (text.trim()) return text.trim();

    // For leaf elements or small containers, use full textContent
    if (el.children.length <= 2) return el.textContent.trim();
    return "";
  }

  /** Walk up the DOM to find the market section container (header + odds) */
  findMarketContainer(headerEl) {
    let el = headerEl;
    let lastGood = null;

    for (let i = 0; i < 6; i++) {
      const parent = el.parentElement;
      if (!parent || parent === document.body) break;

      const rect = parent.getBoundingClientRect();
      if (rect.height > 50 && rect.width > 150) {
        // Too large = contains multiple markets
        if (rect.height > 500) break;

        lastGood = parent;

        // If this container has interactive elements (odds buttons), it's the full market section
        const hasOdds = parent.querySelector("button, [class*='odd'], [class*='Odd'], [class*='price'], [class*='Price'], [class*='outcome'], [class*='Outcome']");
        if (hasOdds) return parent;
      }
      el = parent;
    }

    return lastGood || headerEl.parentElement || headerEl;
  }


  // ─── BUTTON INJECTION ─────────────────────────────────────

  injectMarketButton(container, market) {
    const wrap = document.createElement("div");
    wrap.className = "spark-market-btn-wrap";
    Object.assign(wrap.style, {
      width: "100%",
      margin: "4px 0",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });

    const btn = document.createElement("button");
    btn.className = "spark-market-btn";
    btn.setAttribute("data-market", market.type);
    Object.assign(btn.style, {
      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
      width: "100%", padding: "10px 16px",
      background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(37,99,235,0.12))",
      border: "1px solid rgba(59,130,246,0.25)", borderRadius: "8px",
      color: "#60a5fa", fontSize: "12px", fontWeight: "600",
      cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
      letterSpacing: "0.3px",
    });
    btn.innerHTML = `<span style="font-size:15px;line-height:1">&#9889;</span> Spark AI: Analyze ${market.label}`;

    btn.addEventListener("mouseenter", () => {
      if (!btn.classList.contains("spark-btn-active")) {
        btn.style.background = "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.2))";
        btn.style.borderColor = "rgba(59,130,246,0.4)";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.classList.contains("spark-btn-active")) {
        btn.style.background = "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(37,99,235,0.12))";
        btn.style.borderColor = "rgba(59,130,246,0.25)";
      }
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onMarketClick(market, btn, wrap);
    });

    wrap.appendChild(btn);

    // Insert after the market container
    if (container.nextSibling) {
      container.parentNode.insertBefore(wrap, container.nextSibling);
    } else {
      container.parentNode.appendChild(wrap);
    }
  }


  // ─── MARKET CLICK HANDLER ─────────────────────────────────

  async onMarketClick(market, btn, wrap) {
    // Toggle: if card is open, close it
    const existingCard = this.activeCards.get(market.type);
    if (existingCard) {
      existingCard.remove();
      this.activeCards.delete(market.type);
      btn.classList.remove("spark-btn-active");
      btn.style.background = "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(37,99,235,0.12))";
      btn.style.borderColor = "rgba(59,130,246,0.25)";
      return;
    }

    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spark-ai-spinner"></span> Analyzing...';

    try {
      const prediction = await this.getPrediction();
      if (!prediction) {
        const errMsg = this._lastError || "Analysis unavailable";
        console.error("[Spark AI] Analysis failed:", errMsg);
        this.showBtnError(btn, origHTML, errMsg);
        return;
      }

      // Build and display the market card
      const cardHost = this.buildMarketCard(prediction, market);
      wrap.appendChild(cardHost);
      this.activeCards.set(market.type, cardHost);

      btn.disabled = false;
      btn.innerHTML = origHTML;
      btn.classList.add("spark-btn-active");
      btn.style.background = "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.2))";
      btn.style.borderColor = "rgba(59,130,246,0.5)";

    } catch (err) {
      console.error("[Spark AI] Market analysis failed:", err);
      if (err.message?.includes("Extension context invalidated")) {
        this.showBtnError(btn, origHTML, "Please refresh this page");
      } else {
        this.showBtnError(btn, origHTML, "Something went wrong");
      }
    }
  }

  async getPrediction() {
    if (this.predictionCache) return this.predictionCache;
    if (this.predictionPromise) return this.predictionPromise;
    this.predictionPromise = this._fetchPrediction();
    const result = await this.predictionPromise;
    this.predictionPromise = null;
    return result;
  }

  async _fetchPrediction() {
    if (!this.currentMatch) {
      console.warn("[Spark AI] No match detected on this page");
      this._lastError = "No match detected";
      return null;
    }

    const homeTeam = this.currentMatch.homeTeam;
    const awayTeam = this.currentMatch.awayTeam;
    const competition = this.currentMatch.competition || "";
    console.log(`[Spark AI] Fetching prediction for: "${homeTeam}" vs "${awayTeam}" (competition: "${competition}", source: ${this.currentMatch.source})`);

    // Step 1: Look up team IDs (retry up to 3 times for SW wake-up)
    let lookupResult;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Spark AI] Sending LOOKUP_TEAMS (attempt ${attempt})...`);
        lookupResult = await chrome.runtime.sendMessage({
          type: "LOOKUP_TEAMS",
          teams: [
            { name: homeTeam, position: "home" },
            { name: awayTeam, position: "away" },
          ],
          competition: competition,
        });
      } catch (e) {
        console.error(`[Spark AI] LOOKUP_TEAMS message failed (attempt ${attempt}):`, e.message);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 1500)); continue; }
        this._lastError = "Extension communication error: " + e.message;
        return null;
      }

      if (lookupResult !== undefined) {
        console.log("[Spark AI] LOOKUP_TEAMS raw response (type=" + typeof lookupResult + "):", JSON.stringify(lookupResult)?.substring(0, 500));
        break;
      }
      console.warn(`[Spark AI] LOOKUP_TEAMS returned undefined (attempt ${attempt}), retrying...`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
    }

    if (!lookupResult) {
      console.error("[Spark AI] LOOKUP_TEAMS returned empty/undefined after all retries");
      this._lastError = "Could not reach extension background";
      return null;
    }

    if (lookupResult.error) {
      console.error("[Spark AI] LOOKUP_TEAMS error:", lookupResult.error);
      this._lastError = lookupResult.error;
      return null;
    }

    const matches = lookupResult.matches || [];
    if (matches.length < 2 || !matches[0]?.id || !matches[1]?.id) {
      console.error("[Spark AI] Team lookup failed. Sent:", JSON.stringify({ homeTeam, awayTeam, competition }));
      console.error("[Spark AI] Full response:", JSON.stringify(lookupResult));
      console.error("[Spark AI] Matches array:", JSON.stringify(matches));
      this._lastError = `Teams not found: "${homeTeam}" vs "${awayTeam}"`;
      return null;
    }

    console.log(`[Spark AI] Teams resolved: ${matches[0].name} (${matches[0].id}) vs ${matches[1].name} (${matches[1].id})`);

    // Step 2: Get prediction
    let prediction;
    try {
      prediction = await chrome.runtime.sendMessage({
        type: "PREDICT",
        data: {
          team_a_id: matches[0].id,
          team_b_id: matches[1].id,
          venue: "team_a",
          competition: matches[0].competition || this.currentMatch.competition || "PL",
          team_a_name: matches[0].name,
          team_b_name: matches[1].name,
        },
      });
    } catch (e) {
      console.error("[Spark AI] PREDICT message failed:", e.message);
      this._lastError = "Extension communication error";
      return null;
    }

    if (!prediction) {
      console.error("[Spark AI] PREDICT returned empty response");
      this._lastError = "Empty prediction response";
      return null;
    }

    if (prediction.error) {
      console.error("[Spark AI] PREDICT error:", prediction.error);
      this._lastError = prediction.error;
      return null;
    }

    console.log("[Spark AI] Prediction received successfully");

    // Step 3: Fetch H2H analysis and match stats in parallel for full market data
    const teamAId = matches[0].id;
    const teamBId = matches[1].id;
    const comp = matches[0].competition || this.currentMatch.competition || "PL";

    try {
      const [h2hAnalysis, matchStats] = await Promise.all([
        chrome.runtime.sendMessage({
          type: "GET_H2H_ANALYSIS",
          team_a_id: teamAId,
          team_b_id: teamBId,
          competition: comp,
        }).catch(e => { console.warn("[Spark AI] H2H analysis failed:", e.message); return null; }),
        chrome.runtime.sendMessage({
          type: "GET_MATCH_STATS",
          team_a_id: teamAId,
          team_b_id: teamBId,
          competition: comp,
        }).catch(e => { console.warn("[Spark AI] Match stats failed:", e.message); return null; }),
      ]);

      if (h2hAnalysis && !h2hAnalysis.error) {
        prediction._h2h_analysis = h2hAnalysis;
        console.log("[Spark AI] H2H analysis loaded");
      }
      if (matchStats && !matchStats.error) {
        prediction._match_stats = matchStats;
        console.log("[Spark AI] Match stats loaded");
      }
    } catch (e) {
      console.warn("[Spark AI] Extended data fetch failed (non-critical):", e.message);
    }

    this.predictionCache = prediction;
    return prediction;
  }


  // ─── MARKET CARD BUILDER (Shadow DOM) ─────────────────────

  buildMarketCard(pred, market) {
    const host = document.createElement("div");
    host.className = "spark-market-card-host";
    const shadow = host.attachShadow({ mode: "closed" });

    const outcome = pred.outcome || {};
    const mi = pred.match_info || {};
    const home = mi.team_a?.name || this.currentMatch.homeTeam;
    const away = mi.team_b?.name || this.currentMatch.awayTeam;
    const confidence = outcome.confidence || "Medium";

    let bodyHTML = "";
    switch (market.type) {
      case "1x2":           bodyHTML = this.html1x2(outcome, home, away, confidence); break;
      case "double_chance":  bodyHTML = this.htmlDoubleChance(outcome, home, away); break;
      case "btts":           bodyHTML = this.htmlBTTS(pred, home, away); break;
      case "over_under":     bodyHTML = this.htmlOverUnder(pred, home, away); break;
    }

    const style = document.createElement("style");
    style.textContent = SparkMarketDetector.CARD_CSS;
    shadow.appendChild(style);

    const card = document.createElement("div");
    card.className = "spark-card";
    card.innerHTML = `
      <div class="card-header">
        <span class="card-logo">&#9889; Spark AI Analysis</span>
        <button class="card-close">&times;</button>
      </div>
      <div class="card-match">${home} vs ${away}</div>
      ${bodyHTML}
      <div class="card-footer">
        <button class="full-analysis-btn">View Full Match Analysis &#8594;</button>
      </div>
    `;
    shadow.appendChild(card);

    // Close handler
    card.querySelector(".card-close").addEventListener("click", () => {
      host.remove();
      this.activeCards.delete(market.type);
    });

    // Full analysis handler
    card.querySelector(".full-analysis-btn").addEventListener("click", () => {
      if (typeof SparkAnalysisPanel !== "undefined") {
        SparkAnalysisPanel.show(pred, this.currentMatch);
      }
    });

    return host;
  }


  // ─── MARKET-SPECIFIC HTML ─────────────────────────────────

  html1x2(outcome, home, away, confidence) {
    const hw = (outcome.team_a_win || 0).toFixed(1);
    const dw = (outcome.draw || 0).toFixed(1);
    const aw = (outcome.team_b_win || 0).toFixed(1);
    const confColor = confidence === "High" ? "#22c55e" : confidence === "Medium" ? "#f59e0b" : "#ef4444";

    let pick, pickClass;
    if (outcome.team_a_win >= outcome.draw && outcome.team_a_win >= outcome.team_b_win) {
      pick = `${home} Win`; pickClass = "home";
    } else if (outcome.team_b_win >= outcome.draw) {
      pick = `${away} Win`; pickClass = "away";
    } else {
      pick = "Draw"; pickClass = "draw";
    }

    return `
      <div class="card-body">
        <div class="prob-bar">
          <div class="prob-seg home" style="width:${hw}%"><span>${hw}%</span></div>
          <div class="prob-seg draw" style="width:${dw}%"><span>${dw}%</span></div>
          <div class="prob-seg away" style="width:${aw}%"><span>${aw}%</span></div>
        </div>
        <div class="prob-labels">
          <span>${home}</span><span>Draw</span><span>${away}</span>
        </div>
        <div class="pick-row">
          <span class="pick-label">&#127919; AI Pick:</span>
          <span class="pick-value ${pickClass}">${pick}</span>
          <span class="conf-dot" style="color:${confColor}">&#9679; ${confidence}</span>
        </div>
      </div>
    `;
  }

  htmlDoubleChance(outcome, home, away) {
    const hw = outcome.team_a_win || 0;
    const dw = outcome.draw || 0;
    const aw = outcome.team_b_win || 0;
    const dc1x = (hw + dw).toFixed(1);
    const dcx2 = (dw + aw).toFixed(1);
    const dc12 = (hw + aw).toFixed(1);
    const vals = { "1X": hw + dw, "X2": dw + aw, "12": hw + aw };
    const best = Object.entries(vals).sort((a, b) => b[1] - a[1])[0][0];

    return `
      <div class="card-body">
        <div class="dc-grid">
          <div class="dc-item ${best === '1X' ? 'best' : ''}">
            <div class="dc-name">1X</div>
            <div class="dc-desc">${home} or Draw</div>
            <div class="dc-val">${dc1x}%</div>
          </div>
          <div class="dc-item ${best === 'X2' ? 'best' : ''}">
            <div class="dc-name">X2</div>
            <div class="dc-desc">Draw or ${away}</div>
            <div class="dc-val">${dcx2}%</div>
          </div>
          <div class="dc-item ${best === '12' ? 'best' : ''}">
            <div class="dc-name">12</div>
            <div class="dc-desc">${home} or ${away}</div>
            <div class="dc-val">${dc12}%</div>
          </div>
        </div>
        <div class="pick-row">
          <span class="pick-label">&#128737; AI Pick:</span>
          <span class="pick-value">${best}</span>
          <span class="pick-prob">${vals[best].toFixed(1)}% probability</span>
        </div>
      </div>
    `;
  }

  htmlBTTS(pred, home, away) {
    // Derive BTTS probabilities from odds (implied probability, margin-adjusted)
    let bttsYes = 50, bttsNo = 50;
    const bttsOdds = pred.odds?.btts;
    if (bttsOdds?.length) {
      const o = bttsOdds[0];
      if (o.yes > 0 && o.no > 0) {
        const yImpl = 100 / o.yes;
        const nImpl = 100 / o.no;
        const total = yImpl + nImpl;
        bttsYes = (yImpl / total) * 100;
        bttsNo = (nImpl / total) * 100;
      }
    }
    // Fallback: use goals strength analysis
    if (bttsYes === 50 && bttsNo === 50) {
      const analysis = pred.outcome?.analysis || {};
      const offA = (analysis.goals_strength_a || 50) / 100;
      const offB = (analysis.goals_strength_b || 50) / 100;
      bttsYes = Math.min(85, Math.max(20, (offA * 0.5 + offB * 0.5) * 100 + 10));
      bttsNo = 100 - bttsYes;
    }

    const pick = bttsYes >= bttsNo ? "Yes (GG)" : "No (NG)";
    const pickProb = Math.max(bttsYes, bttsNo);

    return `
      <div class="card-body">
        <div class="bar-grid">
          <div class="bar-item ${bttsYes >= bttsNo ? 'best' : ''}">
            <div class="bar-label">Yes (GG)</div>
            <div class="bar-track"><div class="bar-fill yes" style="width:${bttsYes.toFixed(0)}%"></div></div>
            <div class="bar-val">${bttsYes.toFixed(1)}%</div>
          </div>
          <div class="bar-item ${bttsNo > bttsYes ? 'best' : ''}">
            <div class="bar-label">No (NG)</div>
            <div class="bar-track"><div class="bar-fill no" style="width:${bttsNo.toFixed(0)}%"></div></div>
            <div class="bar-val">${bttsNo.toFixed(1)}%</div>
          </div>
        </div>
        <div class="pick-row">
          <span class="pick-label">&#9917; AI Pick:</span>
          <span class="pick-value">${pick}</span>
          <span class="pick-prob">${pickProb.toFixed(1)}% probability</span>
        </div>
      </div>
    `;
  }

  htmlOverUnder(pred, home, away) {
    // Derive Over/Under probabilities from odds
    let over25 = 50, under25 = 50;
    const ouOdds = pred.odds?.over_under;
    if (ouOdds?.length) {
      const o = ouOdds[0];
      if (o.over_25 > 0 && o.under_25 > 0) {
        const oImpl = 100 / o.over_25;
        const uImpl = 100 / o.under_25;
        const total = oImpl + uImpl;
        over25 = (oImpl / total) * 100;
        under25 = (uImpl / total) * 100;
      }
    }
    // Fallback: use goals strength analysis
    if (over25 === 50 && under25 === 50) {
      const analysis = pred.outcome?.analysis || {};
      const combined = ((analysis.goals_strength_a || 50) + (analysis.goals_strength_b || 50)) / 2;
      over25 = Math.min(80, Math.max(25, combined + 5));
      under25 = 100 - over25;
    }

    const pick = over25 >= under25 ? "Over 2.5 Goals" : "Under 2.5 Goals";
    const pickProb = Math.max(over25, under25);

    return `
      <div class="card-body">
        <div class="bar-grid">
          <div class="bar-item ${over25 >= under25 ? 'best' : ''}">
            <div class="bar-label">Over 2.5</div>
            <div class="bar-track"><div class="bar-fill over" style="width:${over25.toFixed(0)}%"></div></div>
            <div class="bar-val">${over25.toFixed(1)}%</div>
          </div>
          <div class="bar-item ${under25 > over25 ? 'best' : ''}">
            <div class="bar-label">Under 2.5</div>
            <div class="bar-track"><div class="bar-fill under" style="width:${under25.toFixed(0)}%"></div></div>
            <div class="bar-val">${under25.toFixed(1)}%</div>
          </div>
        </div>
        <div class="pick-row">
          <span class="pick-label">&#128202; AI Pick:</span>
          <span class="pick-value">${pick}</span>
          <span class="pick-prob">${pickProb.toFixed(1)}% probability</span>
        </div>
      </div>
    `;
  }


  // ─── MATCH LISTING PAGES ──────────────────────────────────

  scanMatchListings() {
    const allEls = document.querySelectorAll(
      "[class*='match'], [class*='Match'], [class*='event'], [class*='Event'], " +
      "[class*='fixture'], [class*='game'], [class*='Game'], " +
      "[class*='prebet'], [data-testid*='match'], [data-testid*='event'], " +
      "[class*='coupon-row'], [class*='sport-event'], " +
      // Mozzart Bet specific patterns
      "[class*='offer'], [class*='Offer'], [class*='pair'], [class*='Pair'], " +
      "[class*='row-'], tr[class*='odd'], tr[class*='even']"
    );

    // Collect candidates then sort smallest-first so we inject into the
    // most specific (innermost) match row, not a big container.
    const candidates = [];
    for (const el of allEls) {
      if (this.processedListings.has(el)) continue;
      if (el.closest('[data-spark-listing]')) { this.processedListings.add(el); continue; }
      if (el.querySelector('[data-spark-listing]')) { this.processedListings.add(el); continue; }
      if (el.querySelector('.spark-ai-btn, .spark-market-btn-wrap')) { this.processedListings.add(el); continue; }

      const rect = el.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 35 || rect.height > 300) continue;

      candidates.push({ el, area: rect.width * rect.height, height: rect.height });
    }

    // Sort smallest area first → prefer injecting into specific match rows
    candidates.sort((a, b) => a.area - b.area);

    for (const { el, height } of candidates) {
      // Re-check dedup after earlier iterations may have marked ancestors
      if (el.closest('[data-spark-listing]')) { this.processedListings.add(el); continue; }
      if (el.querySelector('[data-spark-listing]')) { this.processedListings.add(el); continue; }

      const text = el.textContent.trim();
      // Skip containers with too much text
      if (text.length > 400) { this.processedListings.add(el); continue; }

      // Skip elements with multiple market header terms (tab bars, column headers)
      const mTerms = text.match(/\b(?:1\s*[x×]\s*2|double\s*chance|both\s*teams?\s*to\s*score|over\s*[/|]?\s*under|total\s*(?:goals?|\d)|btts|gg\s*[/|]\s*ng|match\s*result|full\s*time\s*result)\b/gi);
      if (mTerms && mTerms.length >= 2) { this.processedListings.add(el); continue; }

      // Method 1: Try standard "Team A vs Team B" text pattern
      let match = this.parseTeamsFromText(text);

      // Method 2: Try stacked team names (e.g., Betika format: home on one line, away below)
      if (!match) {
        match = this.parseStackedTeams(el);
      }

      if (match) {
        this.injectInlineButton(el, match);
        this.processedListings.add(el);
        el.setAttribute('data-spark-listing', '1');
        // Mark parent chain (up to 3 levels, within ~3× element height) to prevent
        // sibling sub-elements in the same visual row from also getting buttons
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent && parent !== document.body; i++) {
          const pH = parent.getBoundingClientRect().height;
          if (pH > height * 3) break;
          parent.setAttribute('data-spark-listing', '1');
          this.processedListings.add(parent);
          parent = parent.parentElement;
        }
      }
    }
  }

  /**
   * Parse stacked team names from a listing element (no "vs" separator).
   * Common in Betika, SportPesa etc. where teams are shown vertically:
   *   Man City
   *   Newcastle
   * with odds, dates, and other text mixed in.
   */
  parseStackedTeams(el) {
    // Patterns to reject non-team text
    const junkPattern = /^(?:statistics|stats|score|scoreboard|odds|result|line-?ups?|lineups?|events?|standings?|table|summary|details?|markets?|bets?|data|info|live|match|time|date|status|goal|half|full|total|over|under|handicap|h2h|form|ft|ht|1st|2nd|home|away|draw|won|lost|played|points|all|popular|top|new|highlights|upcoming|countries|featured|filters?|quick-?e|jackpot|virtuals?|casino|promotions?|deposit|account|history|my\s*bets?|football|soccer|betting|games?|sports?|leagues?|fixtures?|pre-?match|in-?play|aviator|basketball|tennis|rugby|cricket|baseball|hockey|esports?|specials?|booked?|lucky\s*numbers?|crash|winner|1x2|double\s*chance|both\s*teams|btts|corners?|cards?|yellow|red|penalty|penalties|booking|anytime|correct|teams?|gg|ng|yes|no|o\/u)$/i;
    const leaguePattern = /(?:premier\s*league|la\s*liga|bundesliga|serie\s*a|ligue\s*1|champions\s*league|europa\s*league|conference\s*league|super\s*league|first\s*division|cup|trophy|shield)/i;
    const countryPattern = /^(?:england|spain|germany|italy|france|kenya|brazil|argentina|portugal|netherlands|scotland|turkey|greece|belgium|austria|switzerland|norway|sweden|denmark|usa|mexico|japan|australia|south\s*africa|nigeria|ghana|egypt)/i;
    const bettingTermsPattern = /\b(?:betting|wagering|sportsbook|betting\s+odds|live\s+scores?|match\s+results?|pre-?match|in-?play)\b/i;

    // Collect candidate team-name text nodes
    const candidates = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t.length < 2 || t.length > 40) continue;
      if (/^\d+$/.test(t)) continue;                        // pure numbers
      if (/^\d+\.\d+$/.test(t)) continue;                   // odds like "1.55"
      if (/^\d+[:\-]\d+$/.test(t)) continue;                // scores "0:0"
      if (/^\d{1,2}[\/\-]\d{1,2}/.test(t)) continue;       // dates "21/02"
      if (/^\d{1,2}:\d{2}$/.test(t)) continue;              // times "23:00"
      if (/^\+\d+/.test(t)) continue;                       // "+90 Markets"
      if (!/[a-zA-Z]{2,}/.test(t)) continue;                // must have 2+ letters
      if (t.includes(",")) continue;                         // breadcrumbs
      if (/^\d/.test(t) && t.length < 10) continue;         // "1X2", "2.50", "1st half"
      if (/^[A-Z]{1,4}$/.test(t)) continue;                 // short abbreviations: "FT","HT","X","GG"
      if (junkPattern.test(t)) continue;
      if (bettingTermsPattern.test(t)) continue;
      if (leaguePattern.test(t)) continue;
      if (countryPattern.test(t)) continue;
      candidates.push(t);
    }

    // Need exactly 2 candidates to be confident these are team names
    // Both must be at least 3 chars (real team names, not "X" or "GG")
    if (candidates.length === 2 && candidates[0] !== candidates[1] &&
        candidates[0].length >= 3 && candidates[1].length >= 3) {
      return {
        homeTeam: candidates[0],
        awayTeam: candidates[1],
        competition: this.guessCompetition(),
        source: "stacked"
      };
    }

    return null;
  }

  injectInlineButton(el, matchInfo) {
    if (el.querySelector(".spark-ai-btn")) return;
    // Skip if a parent element already has listing buttons (prevents nested duplicates)
    if (el.parentElement?.closest('[data-spark-listing]')) return;

    // "Analyze" button
    const analyzeBtn = document.createElement("button");
    analyzeBtn.className = "spark-ai-btn";
    analyzeBtn.innerHTML = '<span class="spark-ai-bolt">&#9889;</span> Analyze';
    analyzeBtn.title = `Analyze ${matchInfo.homeTeam} vs ${matchInfo.awayTeam}`;
    analyzeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onListingAnalyzeClick(matchInfo, analyzeBtn);
    });

    // "Track" button
    const trackBtn = document.createElement("button");
    trackBtn.className = "spark-ai-btn spark-track-btn";
    trackBtn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
    trackBtn.title = `Track ${matchInfo.homeTeam} vs ${matchInfo.awayTeam}`;
    trackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTeamSelector(matchInfo, trackBtn, el);
    });

    // Live score badge (hidden until live data arrives)
    const scoreBadge = document.createElement("div");
    scoreBadge.className = "spark-live-score-badge";
    scoreBadge.style.display = "none";
    scoreBadge.setAttribute("data-fixture-home", matchInfo.homeTeam);
    scoreBadge.setAttribute("data-fixture-away", matchInfo.awayTeam);

    el.style.position = "relative";
    el.appendChild(analyzeBtn);
    el.appendChild(trackBtn);
    el.appendChild(scoreBadge);

    // Synchronously restore tracking state from local cache (no async flash)
    this._syncRestoreTrackState(matchInfo, trackBtn, scoreBadge, el);
  }

  /** Synchronously restore "Tracking" state from in-memory cache (no async delay) */
  _syncRestoreTrackState(matchInfo, trackBtn, scoreBadge, containerEl) {
    const tracked = window._sparkTrackedMatches || {};
    for (const [fid, data] of Object.entries(tracked)) {
      if (this._teamsMatch(data, matchInfo)) {
        trackBtn.innerHTML = '<span>&#9989;</span> Tracking';
        trackBtn.classList.add("spark-track-active");
        trackBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._untrackAndReset(fid, trackBtn, matchInfo, containerEl);
        };
        // Show live score badge if match is live
        const LIVE = ["1H", "2H", "HT", "ET", "LIVE"];
        const FINISHED = ["FT", "AET", "PEN"];
        if (scoreBadge && LIVE.includes(data.status)) {
          scoreBadge.style.display = "flex";
          scoreBadge.innerHTML = `
            <span class="spark-score-status spark-score-live">${data.elapsed || ""}'</span>
            <span class="spark-score-numbers">${data.homeGoals ?? 0} - ${data.awayGoals ?? 0}</span>
          `;
        } else if (scoreBadge && FINISHED.includes(data.status)) {
          scoreBadge.style.display = "flex";
          scoreBadge.innerHTML = `
            <span class="spark-score-status spark-score-ft">${data.status}</span>
            <span class="spark-score-numbers">${data.homeGoals ?? 0} - ${data.awayGoals ?? 0}</span>
          `;
        }
        break;
      }
    }
  }

  _teamsMatch(tracked, matchInfo) {
    const mh = (matchInfo.homeTeam || "").toLowerCase();
    const ma = (matchInfo.awayTeam || "").toLowerCase();
    // Check against both API names and original DOM display names
    const homeNames = [tracked.homeTeam, tracked.displayHomeTeam].filter(Boolean).map(n => n.toLowerCase());
    const awayNames = [tracked.awayTeam, tracked.displayAwayTeam].filter(Boolean).map(n => n.toLowerCase());
    const homeMatch = homeNames.some(th => th.includes(mh) || mh.includes(th));
    const awayMatch = awayNames.some(ta => ta.includes(ma) || ma.includes(ta));
    return homeMatch && awayMatch;
  }

  async _untrackAndReset(fixtureId, trackBtn, matchInfo, containerEl) {
    await chrome.runtime.sendMessage({ type: "UNTRACK_MATCH", fixtureId });
    // Update local cache so re-injected buttons stay in "Track" state
    if (window._sparkTrackedMatches) {
      delete window._sparkTrackedMatches[fixtureId];
    }
    trackBtn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
    trackBtn.classList.remove("spark-track-active");
    trackBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTeamSelector(matchInfo, trackBtn, containerEl);
    };
    const badge = containerEl.querySelector(".spark-live-score-badge");
    if (badge) badge.style.display = "none";
  }

  showTeamSelector(matchInfo, trackBtn, containerEl) {
    // Remove any existing selector
    document.querySelectorAll(".spark-team-selector").forEach(el => el.remove());

    const selector = document.createElement("div");
    selector.className = "spark-team-selector";
    selector.innerHTML = `
      <div class="spark-team-selector-title">Which team are you supporting?</div>
      <button class="spark-team-option spark-team-home">${matchInfo.homeTeam}</button>
      <button class="spark-team-option spark-team-away">${matchInfo.awayTeam}</button>
      <button class="spark-team-selector-cancel">Cancel</button>
    `;

    const doTrack = async (isHome) => {
      selector.remove();
      trackBtn.disabled = true;
      trackBtn.innerHTML = '<span class="spark-ai-spinner"></span>';

      try {
        // Resolve team IDs (reuses existing LOOKUP_TEAMS flow)
        const lookupResult = await chrome.runtime.sendMessage({
          type: "LOOKUP_TEAMS",
          teams: [
            { name: matchInfo.homeTeam, position: "home" },
            { name: matchInfo.awayTeam, position: "away" },
          ],
          competition: matchInfo.competition || "",
        });

        if (lookupResult?.error || !lookupResult?.matches || lookupResult.matches.length < 2) {
          trackBtn.innerHTML = '<span>&#9888;</span> Not found';
          setTimeout(() => {
            trackBtn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
            trackBtn.disabled = false;
          }, 2500);
          return;
        }

        const homeMatch = lookupResult.matches[0];
        const awayMatch = lookupResult.matches[1];
        const teamId = isHome ? homeMatch.id : awayMatch.id;
        const teamName = isHome ? homeMatch.name : awayMatch.name;

        const result = await chrome.runtime.sendMessage({
          type: "TRACK_MATCH",
          match: {
            homeTeam: homeMatch.name,
            awayTeam: awayMatch.name,
            homeTeamId: homeMatch.id,
            awayTeamId: awayMatch.id,
            homeCrest: homeMatch.crest || "",
            awayCrest: awayMatch.crest || "",
            // Pass original DOM-parsed names for reliable matching on re-renders
            displayHomeTeam: matchInfo.homeTeam,
            displayAwayTeam: matchInfo.awayTeam,
          },
          teamId,
          teamName,
          isHome,
        });

        if (result?.success) {
          trackBtn.innerHTML = '<span>&#9989;</span> Tracking';
          trackBtn.classList.add("spark-track-active");
          trackBtn.disabled = false;
          const fixtureId = result.tracked.fixtureId;
          // Update local cache so re-injected buttons stay "Tracking" without async delay
          if (!window._sparkTrackedMatches) window._sparkTrackedMatches = {};
          window._sparkTrackedMatches[fixtureId] = result.tracked;
          trackBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._untrackAndReset(fixtureId, trackBtn, matchInfo, containerEl);
          };
          console.log(`[Spark AI] Now tracking: ${homeMatch.name} vs ${awayMatch.name} (team: ${teamName})`);
        } else {
          trackBtn.innerHTML = '<span>&#9888;</span> ' + (result?.error || "Failed");
          setTimeout(() => {
            trackBtn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
            trackBtn.disabled = false;
          }, 2500);
        }
      } catch (err) {
        console.error("[Spark AI] Track error:", err);
        trackBtn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
        trackBtn.disabled = false;
      }
    };

    selector.querySelector(".spark-team-home").addEventListener("click", (e) => { e.stopPropagation(); doTrack(true); });
    selector.querySelector(".spark-team-away").addEventListener("click", (e) => { e.stopPropagation(); doTrack(false); });
    selector.querySelector(".spark-team-selector-cancel").addEventListener("click", (e) => { e.stopPropagation(); selector.remove(); });

    // Close on outside click (with slight delay to avoid immediate close)
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!selector.contains(e.target) && e.target !== trackBtn) {
          selector.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }, 100);

    containerEl.appendChild(selector);
  }

  async onListingAnalyzeClick(matchInfo, btn) {
    const prevMatch = this.currentMatch;
    const prevCache = this.predictionCache;
    this.currentMatch = matchInfo;
    this.predictionCache = null;
    this.predictionPromise = null;

    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spark-ai-spinner"></span> Analyzing...';
    btn.classList.add("spark-ai-btn-loading");

    try {
      const prediction = await this.getPrediction();
      if (prediction && typeof SparkAnalysisPanel !== "undefined") {
        SparkAnalysisPanel.show(prediction, matchInfo);
      } else if (!prediction) {
        const errMsg = this._lastError || "Could not identify teams";
        console.error("[Spark AI] Listing analysis failed:", errMsg);
        this.showBtnError(btn, origHTML, errMsg);
        this.currentMatch = prevMatch;
        this.predictionCache = prevCache;
        return;
      }
      btn.disabled = false;
      btn.innerHTML = origHTML;
      btn.classList.remove("spark-ai-btn-loading");
    } catch (err) {
      this.showBtnError(btn, origHTML, "Something went wrong");
    }

    this.currentMatch = prevMatch;
    this.predictionCache = prevCache;
  }


  // ─── HELPERS ──────────────────────────────────────────────

  showBtnError(btn, origHTML, msg) {
    btn.disabled = false;
    btn.innerHTML = `<span style="font-size:14px">&#9888;</span> ${msg}`;
    setTimeout(() => { btn.innerHTML = origHTML; }, 3000);
  }


  // ─── CARD CSS (Shadow DOM isolated) ───────────────────────

  static CARD_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    .spark-card {
      background: #0f172a; color: #e2e8f0;
      border: 1px solid rgba(59,130,246,0.3); border-radius: 12px;
      overflow: hidden; margin: 8px 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      animation: cardEnter 0.3s ease;
    }

    @keyframes cardEnter {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.1));
      border-bottom: 1px solid rgba(59,130,246,0.2);
    }
    .card-logo { font-size: 13px; font-weight: 700; color: #60a5fa; }
    .card-close {
      background: none; border: none; color: #64748b; font-size: 18px;
      cursor: pointer; padding: 2px 6px; line-height: 1;
    }
    .card-close:hover { color: #e2e8f0; }

    .card-match {
      text-align: center; padding: 8px 14px 4px;
      font-size: 12px; color: #94a3b8; font-weight: 600;
    }

    .card-body { padding: 12px 14px; }

    /* ── Probability Bar (1×2) ── */
    .prob-bar { display: flex; height: 32px; border-radius: 8px; overflow: hidden; }
    .prob-seg {
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #fff; min-width: 36px;
    }
    .prob-seg.home { background: #22c55e; }
    .prob-seg.draw { background: #64748b; }
    .prob-seg.away { background: #ef4444; }
    .prob-labels {
      display: flex; justify-content: space-between;
      font-size: 10px; color: #64748b; margin-top: 4px; padding: 0 2px;
    }

    /* ── Double Chance ── */
    .dc-grid { display: flex; gap: 8px; }
    .dc-item {
      flex: 1; text-align: center; background: #1e293b; border-radius: 8px;
      padding: 10px 6px; border: 1px solid transparent; transition: all 0.2s;
    }
    .dc-item.best { border-color: #22c55e; background: rgba(34,197,94,0.08); }
    .dc-name { font-size: 14px; font-weight: 800; color: #f1f5f9; }
    .dc-desc { font-size: 9px; color: #64748b; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dc-val { font-size: 16px; font-weight: 800; color: #60a5fa; }
    .dc-item.best .dc-val { color: #22c55e; }

    /* ── Bar Charts (BTTS / Over-Under) ── */
    .bar-grid { display: flex; flex-direction: column; gap: 10px; }
    .bar-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; background: #1e293b; border-radius: 8px;
      border: 1px solid transparent;
    }
    .bar-item.best { border-color: #22c55e; background: rgba(34,197,94,0.06); }
    .bar-label { font-size: 12px; font-weight: 600; color: #94a3b8; width: 70px; flex-shrink: 0; }
    .bar-track { flex: 1; height: 8px; background: #0f172a; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
    .bar-fill.yes { background: #22c55e; }
    .bar-fill.no { background: #ef4444; }
    .bar-fill.over { background: #3b82f6; }
    .bar-fill.under { background: #f59e0b; }
    .bar-val { font-size: 13px; font-weight: 700; width: 50px; text-align: right; }

    /* ── AI Pick Row ── */
    .pick-row {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-top: 12px; padding-top: 10px;
      border-top: 1px solid #1e293b;
    }
    .pick-label { font-size: 12px; color: #94a3b8; }
    .pick-value {
      font-size: 13px; font-weight: 700; color: #22c55e;
      background: rgba(34,197,94,0.1); padding: 3px 10px; border-radius: 12px;
    }
    .pick-value.home { color: #22c55e; background: rgba(34,197,94,0.1); }
    .pick-value.draw { color: #f59e0b; background: rgba(245,158,11,0.1); }
    .pick-value.away { color: #ef4444; background: rgba(239,68,68,0.1); }
    .conf-dot { font-size: 11px; margin-left: auto; }
    .pick-prob { font-size: 11px; color: #64748b; }

    /* ── Footer ── */
    .card-footer {
      padding: 8px 14px; border-top: 1px solid #1e293b;
      text-align: center;
    }
    .full-analysis-btn {
      background: none; border: none; color: #60a5fa;
      font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: inherit; padding: 4px 8px;
    }
    .full-analysis-btn:hover { color: #93c5fd; text-decoration: underline; }
  `;
}


// ═══════════════════════════════════════════════════════════════
// LIVE SCORE BADGE UPDATER (called from service worker broadcasts)
// ═══════════════════════════════════════════════════════════════

function updateLiveScoreBadges(tracked) {
  if (!tracked) return;

  // Update local cache so re-injected buttons stay in sync
  window._sparkTrackedMatches = tracked;

  const LIVE = ["1H", "2H", "HT", "ET", "LIVE"];
  const FINISHED = ["FT", "AET", "PEN"];
  const badges = document.querySelectorAll(".spark-live-score-badge");

  for (const badge of badges) {
    const fHome = (badge.getAttribute("data-fixture-home") || "").toLowerCase();
    const fAway = (badge.getAttribute("data-fixture-away") || "").toLowerCase();
    if (!fHome || !fAway) continue;

    // Find matching tracked match (check both API names and display names)
    let matchData = null;
    for (const [, data] of Object.entries(tracked)) {
      const homeNames = [data.homeTeam, data.displayHomeTeam].filter(Boolean).map(n => n.toLowerCase());
      const awayNames = [data.awayTeam, data.displayAwayTeam].filter(Boolean).map(n => n.toLowerCase());
      const homeMatch = homeNames.some(dh => dh.includes(fHome) || fHome.includes(dh));
      const awayMatch = awayNames.some(da => da.includes(fAway) || fAway.includes(da));
      if (homeMatch && awayMatch) {
        matchData = data;
        break;
      }
    }

    if (matchData) {
      const isLive = LIVE.includes(matchData.status);
      const isFinished = FINISHED.includes(matchData.status);

      if (isLive || isFinished) {
        badge.style.display = "flex";
        const statusClass = isLive ? "spark-score-live" : "spark-score-ft";
        const statusText = isLive ? (matchData.elapsed ? matchData.elapsed + "'" : "LIVE") : matchData.status;
        badge.innerHTML = `
          <span class="spark-score-status ${statusClass}">${statusText}</span>
          <span class="spark-score-numbers">${matchData.homeGoals ?? 0} - ${matchData.awayGoals ?? 0}</span>
        `;
      } else {
        badge.style.display = "none";
      }
    }
  }

  // Also update track buttons for matches that were auto-untracked (match ended)
  const trackBtns = document.querySelectorAll(".spark-track-btn.spark-track-active");
  for (const btn of trackBtns) {
    const container = btn.parentElement;
    if (!container) continue;
    const badge = container.querySelector(".spark-live-score-badge");
    if (!badge) continue;
    const fHome = (badge.getAttribute("data-fixture-home") || "").toLowerCase();
    const fAway = (badge.getAttribute("data-fixture-away") || "").toLowerCase();

    let stillTracked = false;
    for (const [, data] of Object.entries(tracked)) {
      const homeNames = [data.homeTeam, data.displayHomeTeam].filter(Boolean).map(n => n.toLowerCase());
      const awayNames = [data.awayTeam, data.displayAwayTeam].filter(Boolean).map(n => n.toLowerCase());
      if (homeNames.some(dh => dh.includes(fHome) || fHome.includes(dh)) &&
          awayNames.some(da => da.includes(fAway) || fAway.includes(da))) {
        stillTracked = true;
        break;
      }
    }

    if (!stillTracked) {
      btn.innerHTML = '<span class="spark-ai-bolt">&#128064;</span> Track';
      btn.classList.remove("spark-track-active");
    }
  }
}
