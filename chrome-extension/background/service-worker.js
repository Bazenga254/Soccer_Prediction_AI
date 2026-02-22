/**
 * Spark AI Chrome Extension - Background Service Worker
 * Handles API communication, auth, Google OAuth, session management,
 * subscription checks, and payment flow.
 */

console.log("[Spark AI SW] Service worker loaded at", new Date().toISOString());

const API_BASE = "https://spark-ai-prediction.com";
const GOOGLE_CLIENT_ID = "905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com";
const SESSION_DURATION_DAYS = 14;
const REVALIDATE_INTERVAL_HOURS = 6;

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Spark AI SW] Message received:", message.type, "from", sender?.tab?.url?.substring(0, 60) || "popup");

  const handler = MESSAGE_HANDLERS[message.type];
  if (!handler) {
    console.warn("[Spark AI SW] No handler for message type:", message.type);
    sendResponse({ error: "Unknown message type: " + message.type });
    return false;
  }

  (async () => {
    try {
      const result = await handler(message, sender);
      console.log("[Spark AI SW] Response for", message.type, ":", JSON.stringify(result)?.substring(0, 500));
      sendResponse(result);
    } catch (err) {
      console.error("[Spark AI SW] Handler error for", message.type, ":", err);
      sendResponse({ error: err.message || "Unknown error" });
    }
  })();
  return true; // async response
});

const MESSAGE_HANDLERS = {
  LOGIN: (msg) => handleLogin(msg.email, msg.password),
  GOOGLE_LOGIN: () => handleGoogleLogin(),
  CHECK_AUTH: () => checkAuth(),
  PREDICT: (msg) => handlePredict(msg.data),
  LOOKUP_TEAMS: (msg) => handleLookupTeams(msg.teams, msg.competition),
  LOGOUT: () => handleLogout(),
  LOG_EVENT: (msg) => logExtensionEvent(msg.action, msg.details),
  GET_PLANS: () => getPlans(),
  GET_SUBSCRIPTION: () => getSubscription(),
  INITIATE_MPESA: (msg) => initiateMpesa(msg.plan_id, msg.phone),
  CHECK_PAYMENT: (msg) => checkPayment(msg.tx_id),
  CREATE_CARD_CHECKOUT: (msg) => createCardCheckout(msg.plan_id),
  PAY_WITH_BALANCE: (msg) => payWithBalance(msg.plan_id),
  GET_H2H_ANALYSIS: (msg) => handleH2HAnalysis(msg.team_a_id, msg.team_b_id, msg.competition),
  GET_MATCH_STATS: (msg) => handleMatchStats(msg.team_a_id, msg.team_b_id, msg.competition),
  // Extension toggle
  GET_TOGGLE_STATE: async () => {
    const stored = await chrome.storage.local.get(["spark_extension_enabled"]);
    return { enabled: stored.spark_extension_enabled !== false };
  },
  // Match tracking
  TRACK_MATCH: (msg) => handleTrackMatch(msg.match, msg.teamId, msg.teamName, msg.isHome),
  UNTRACK_MATCH: (msg) => handleUntrackMatch(msg.fixtureId),
  GET_TRACKED_MATCHES: () => getTrackedMatches(),
  GET_LIVE_SCORES: () => getTrackedMatches(),
};

// === GOOGLE OAUTH ===
async function handleGoogleLogin() {
  try {
    const redirectUrl = chrome.identity.getRedirectURL();
    const nonce = crypto.randomUUID();

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("prompt", "select_account");

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    // Extract id_token from the URL hash fragment
    const hashParams = new URLSearchParams(responseUrl.split("#")[1]);
    const idToken = hashParams.get("id_token");

    if (!idToken) {
      return { success: false, error: "Google sign-in was cancelled" };
    }

    // Send to our backend
    const resp = await fetch(`${API_BASE}/api/user/google-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: idToken,
        captcha_token: "",
        terms_accepted: true,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err.detail || err.error || `Google login failed (${resp.status})` };
    }

    const data = await resp.json();
    if (data.success || data.token) {
      await chrome.storage.local.set({
        spark_token: data.token,
        spark_user: data.user || {},
        spark_login_time: Date.now(),
        spark_last_validate: Date.now(),
      });
      // Log extension login event
      logExtensionEvent("login_google", data.user?.email || "").catch(() => {});
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error || data.detail || "Google login failed" };
  } catch (e) {
    if (e.message?.includes("canceled") || e.message?.includes("cancelled")) {
      return { success: false, error: "Google sign-in was cancelled" };
    }
    return { success: false, error: "Google sign-in failed. Please try again." };
  }
}

// === EMAIL/PASSWORD AUTH ===
async function handleLogin(email, password) {
  try {
    const resp = await fetch(`${API_BASE}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, captcha_token: "" }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { success: false, error: err.detail || err.error || `Login failed (${resp.status})` };
    }

    const data = await resp.json();
    if (data.success || data.token) {
      await chrome.storage.local.set({
        spark_token: data.token,
        spark_user: data.user || {},
        spark_login_time: Date.now(),
        spark_last_validate: Date.now(),
      });
      logExtensionEvent("login_email", email).catch(() => {});
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error || data.detail || "Login failed" };
  } catch (e) {
    return { success: false, error: "Connection failed. Check your internet." };
  }
}

// === AUTH CHECK (with persistent session) ===
async function checkAuth() {
  const stored = await chrome.storage.local.get([
    "spark_token", "spark_user", "spark_login_time", "spark_last_validate",
  ]);

  if (!stored.spark_token) {
    return { authenticated: false };
  }

  // Check if session has expired (14 days)
  const loginTime = stored.spark_login_time || 0;
  const sessionAge = Date.now() - loginTime;
  const maxSession = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

  if (sessionAge > maxSession) {
    await chrome.storage.local.remove(["spark_token", "spark_user", "spark_login_time", "spark_last_validate"]);
    return { authenticated: false, error: "Session expired. Please log in again." };
  }

  // Check if we need to revalidate with server
  const lastValidate = stored.spark_last_validate || 0;
  const timeSinceValidate = Date.now() - lastValidate;
  const revalidateInterval = REVALIDATE_INTERVAL_HOURS * 60 * 60 * 1000;

  if (timeSinceValidate < revalidateInterval) {
    // Use cached data — no need to hit the server
    return {
      authenticated: true,
      user: stored.spark_user,
      is_pro: stored.spark_user?.tier === "pro",
      tier: stored.spark_user?.tier || "free",
      cached: true,
    };
  }

  // Revalidate with server
  try {
    const resp = await fetch(`${API_BASE}/api/extension/validate`, {
      headers: { Authorization: `Bearer ${stored.spark_token}` },
    });

    if (resp.status === 401) {
      await chrome.storage.local.remove(["spark_token", "spark_user", "spark_login_time", "spark_last_validate"]);
      return { authenticated: false, error: "Session expired" };
    }

    if (!resp.ok) {
      // Server error — trust cached data
      return {
        authenticated: true,
        user: stored.spark_user,
        is_pro: stored.spark_user?.tier === "pro",
        tier: stored.spark_user?.tier || "free",
      };
    }

    const data = await resp.json();

    // Update cached tier info
    const updatedUser = { ...stored.spark_user, tier: data.tier };
    await chrome.storage.local.set({
      spark_user: updatedUser,
      spark_last_validate: Date.now(),
    });

    return {
      authenticated: true,
      user: updatedUser,
      is_pro: data.is_pro,
      tier: data.tier,
      username: data.username,
    };
  } catch {
    // Offline — trust cached data
    return {
      authenticated: true,
      user: stored.spark_user,
      is_pro: stored.spark_user?.tier === "pro",
      tier: stored.spark_user?.tier || "free",
    };
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(["spark_token", "spark_user", "spark_login_time", "spark_last_validate"]);
  return { success: true };
}

// === API HELPERS ===
async function getToken() {
  const stored = await chrome.storage.local.get(["spark_token"]);
  return stored.spark_token || null;
}

async function authFetch(url, options = {}) {
  const token = await getToken();
  if (!token) {
    console.warn("[Spark AI SW] authFetch: No token found");
    return { error: "Not authenticated" };
  }

  console.log("[Spark AI SW] authFetch:", options.method || "GET", url);

  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    console.log("[Spark AI SW] authFetch status:", resp.status, resp.statusText, url);

    if (resp.status === 401) {
      return { error: "Session expired. Please log in again." };
    }
    if (resp.status === 403) {
      return { error: "Pro subscription required." };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn("[Spark AI SW] authFetch error body:", body.substring(0, 200));
      return { error: `Request failed (${resp.status})` };
    }

    const text = await resp.text();
    console.log("[Spark AI SW] authFetch response:", text.substring(0, 300));
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("[Spark AI SW] JSON parse failed:", e.message);
      return { error: "Invalid server response" };
    }
  } catch (e) {
    console.error("[Spark AI SW] authFetch network error:", url, e.message);
    return { error: "Connection failed. Check your internet." };
  }
}

// === EXTENSION EVENT LOGGING ===
async function logExtensionEvent(action, details) {
  return authFetch(`${API_BASE}/api/extension/log-event`, {
    method: "POST",
    body: JSON.stringify({ action: action || "unknown", details: details || "" }),
  });
}

// === PREDICTION API ===
async function handlePredict(data) {
  console.log("[Spark AI SW] PREDICT request:", data.team_a_name, "vs", data.team_b_name);
  const result = await authFetch(`${API_BASE}/api/predict`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "X-Spark-Source": "extension" },
  });
  if (result.error) console.error("[Spark AI SW] PREDICT error:", result.error);
  else console.log("[Spark AI SW] PREDICT success");
  return result;
}

async function handleLookupTeams(teams, competition) {
  console.log("[Spark AI SW] LOOKUP_TEAMS request:", teams?.map(t => t.name).join(" vs "));
  const result = await authFetch(`${API_BASE}/api/extension/lookup-teams`, {
    method: "POST",
    body: JSON.stringify({ teams, competition: competition || "" }),
    headers: { "X-Spark-Source": "extension" },
  });
  if (result.error) console.error("[Spark AI SW] LOOKUP_TEAMS error:", result.error);
  else console.log("[Spark AI SW] LOOKUP_TEAMS success:", JSON.stringify(result.matches));
  return result;
}

// === H2H ANALYSIS & MATCH STATS ===
async function handleH2HAnalysis(teamAId, teamBId, competition) {
  console.log("[Spark AI SW] H2H_ANALYSIS request:", teamAId, "vs", teamBId);
  const result = await authFetch(
    `${API_BASE}/api/h2h-analysis/${teamAId}/${teamBId}?competition=${competition || ""}`,
    { headers: { "X-Spark-Source": "extension" } }
  );
  if (result.error) console.error("[Spark AI SW] H2H_ANALYSIS error:", result.error);
  else console.log("[Spark AI SW] H2H_ANALYSIS success");
  return result;
}

async function handleMatchStats(teamAId, teamBId, competition) {
  console.log("[Spark AI SW] MATCH_STATS request:", teamAId, "vs", teamBId);
  const result = await authFetch(
    `${API_BASE}/api/match-stats/${teamAId}/${teamBId}?competition=${competition || ""}`,
    { headers: { "X-Spark-Source": "extension" } }
  );
  if (result.error) console.error("[Spark AI SW] MATCH_STATS error:", result.error);
  else console.log("[Spark AI SW] MATCH_STATS success");
  return result;
}

// === SUBSCRIPTION & PAYMENT ===
async function getPlans() {
  try {
    // Fetch plans and detect currency in parallel
    const [pricingResp, geoResp] = await Promise.all([
      fetch(`${API_BASE}/api/pricing`),
      fetch(`${API_BASE}/api/geo/detect`).catch(() => null),
    ]);
    if (!pricingResp.ok) return { error: "Failed to load plans" };
    const data = await pricingResp.json();

    // Detect user currency (default USD)
    let currency = "USD";
    try {
      if (geoResp && geoResp.ok) {
        const geo = await geoResp.json();
        currency = geo.currency || "USD";
      }
    } catch { /* fallback to USD */ }

    // Convert plans object to array with id field for popup consumption
    if (data.plans && !Array.isArray(data.plans)) {
      data.plans = Object.entries(data.plans).map(([id, plan]) => ({ id, ...plan }));
    }
    data.detectedCurrency = currency;
    return data;
  } catch {
    return { error: "Connection failed" };
  }
}

async function getSubscription() {
  return authFetch(`${API_BASE}/api/subscription/status`);
}

async function initiateMpesa(planId, phone) {
  return authFetch(`${API_BASE}/api/payment/mpesa/initiate`, {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      phone_number: phone,
      transaction_type: "subscription",
    }),
  });
}

async function checkPayment(txId) {
  return authFetch(`${API_BASE}/api/payment/status/${txId}`);
}

async function createCardCheckout(planId) {
  return authFetch(`${API_BASE}/api/whop/create-checkout`, {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      transaction_type: "subscription",
    }),
  });
}

async function payWithBalance(planId) {
  return authFetch(`${API_BASE}/api/subscription/pay-with-balance`, {
    method: "POST",
    body: JSON.stringify({ plan_id: planId }),
  });
}

// === SUBSCRIPTION EXPIRY ALARM ===
chrome.alarms.create("check-subscription", { periodInMinutes: 360 }); // Every 6 hours

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "check-subscription") {
    const stored = await chrome.storage.local.get(["spark_token", "spark_user"]);
    if (!stored.spark_token) return;

    try {
      const resp = await fetch(`${API_BASE}/api/extension/validate`, {
        headers: { Authorization: `Bearer ${stored.spark_token}` },
      });

      if (resp.status === 401) {
        // Token expired — clear session
        await chrome.storage.local.remove(["spark_token", "spark_user", "spark_login_time", "spark_last_validate"]);
        return;
      }

      if (resp.ok) {
        const data = await resp.json();
        const updatedUser = { ...stored.spark_user, tier: data.tier };
        await chrome.storage.local.set({
          spark_user: updatedUser,
          spark_last_validate: Date.now(),
        });
      }
    } catch {
      // Offline — skip
    }
  }

  if (alarm.name === "spark-live-poll") {
    await pollLiveMatches();
  }
});


// ═══════════════════════════════════════════════════════════════
// MATCH TRACKING & LIVE SCORE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

// --- Notification content (ported from frontend/src/pages/LiveScores.jsx) ---

// No external GIF URLs — all animations are CSS-based in goal-notification.html

const HEADLINES = {
  tracking_started: ["Good Choice! \ud83d\udc4d", "Let's Go! \ud83d\udd25", "Locked In! \ud83d\udd12", "Game On! \ud83c\udfae", "You're Set! \u2705", "Eyes On! \ud83d\udc40"],
  celebration: ["GOOOAAAL! \ud83c\udf89", "GET IN! \ud83d\udcaa", "YESSS! \ud83d\udd25", "WHAT A GOAL! \u26bd", "BRILLIANT! \ud83c\udf1f", "SCENES! \ud83c\udf8a"],
  sad: ["They scored... \ud83d\ude14", "Conceded \ud83d\ude1e", "Oh no... \ud83d\ude29", "That hurts... \ud83d\udc94"],
  worried: ["It's level! \ud83d\ude30", "They've equalized! \ud83d\ude2c", "All square... \ud83d\ude24"],
  big_lead: ["CRUISING! \ud83d\ude0e", "DOMINANT! \ud83d\udcaa", "ON FIRE! \ud83d\udd25\ud83d\udd25", "RUNNING RIOT! \ud83c\udfc6"],
  match_won: ["VICTORY! \ud83c\udfc6", "WE WON! \ud83c\udf89\ud83c\udf89", "FULL TIME - WIN! \ud83d\udd25", "GET IN THERE! \ud83d\udcaa"],
  match_lost: ["Defeat \ud83d\udc94", "We lost... \ud83d\ude2d", "Not our day... \ud83d\ude22", "Tough loss \ud83d\ude29"],
  match_draw: ["Full Time - Draw \ud83e\udd1d", "Honors even \ud83d\ude10", "A point each \ud83e\udd37"],
};

const SUB_MESSAGES = {
  tracking_started: ["You made the right choice!", "We'll keep you posted on every goal!", "Sit back and enjoy the match!", "You'll get notified when they score!", "Tracking is live! Good luck!"],
  celebration: ["Your team just scored!", "What a moment!", "The crowd goes wild!", "Pure class!", "Brilliant finish!"],
  sad: ["Stay strong, anything can happen!", "Keep believing!", "It's not over yet...", "There is still time!"],
  worried: ["Come on, you can do this!", "Time to fight back!", "It's anyone's game now!", "Deep breaths..."],
  big_lead: ["Absolutely dominant!", "No mercy!", "A masterclass!", "Running the show!"],
  match_won: ["Congratulations! What a performance!", "Three points in the bag!", "Well deserved victory!", "Time to celebrate!"],
  match_lost: ["Better luck next time...", "There's always the next match.", "Keep your head up!", "The comeback starts next match!"],
  match_draw: ["A fair result in the end.", "Could have gone either way.", "On to the next one!"],
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "LIVE"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);


// --- Match tracking handlers ---

async function handleTrackMatch(match, teamId, teamName, isHome) {
  if (!match) return { error: "No match data provided" };

  const stored = await chrome.storage.local.get(["spark_tracked_matches"]);
  const tracked = stored.spark_tracked_matches || {};

  const homeName = match.home_team?.name || match.homeTeam || "";
  const awayName = match.away_team?.name || match.awayTeam || "";
  const homeCrest = match.home_team?.crest || match.homeCrest || "";
  const awayCrest = match.away_team?.crest || match.awayCrest || "";
  // Display names = original DOM-parsed names from the betting site (for reliable matching)
  const displayHome = match.displayHomeTeam || homeName;
  const displayAway = match.displayAwayTeam || awayName;

  // Resolve fixture ID and capture live data from the API
  let fixtureId = match.id || match.fixtureId;
  let liveGoalsHome = match.goals?.home ?? 0;
  let liveGoalsAway = match.goals?.away ?? 0;
  let liveStatus = match.status || "NS";
  let liveElapsed = match.elapsed || 0;

  try {
    const resp = await fetch(`${API_BASE}/api/live-matches`);
    if (resp.ok) {
      const data = await resp.json();
      const found = (data.matches || []).find(m =>
        (m.home_team?.id === match.homeTeamId && m.away_team?.id === match.awayTeamId) ||
        (m.home_team?.name === homeName && m.away_team?.name === awayName)
      );
      if (found) {
        if (!fixtureId) fixtureId = found.id;
        // Capture current live data so badges show immediately
        liveGoalsHome = found.goals?.home ?? liveGoalsHome;
        liveGoalsAway = found.goals?.away ?? liveGoalsAway;
        liveStatus = found.status || liveStatus;
        liveElapsed = found.elapsed || liveElapsed;
        console.log(`[Spark AI SW] Found live match: ${found.id} status=${liveStatus} ${liveGoalsHome}-${liveGoalsAway}`);
      }
    }
  } catch (e) {
    console.warn("[Spark AI SW] Could not resolve fixture from live API:", e.message);
  }

  if (!fixtureId) {
    fixtureId = `pending_${match.homeTeamId || 0}_${match.awayTeamId || 0}`;
  }

  tracked[fixtureId] = {
    fixtureId,
    teamId,
    teamName,
    isHome,
    homeTeam: homeName,
    awayTeam: awayName,
    displayHomeTeam: displayHome,
    displayAwayTeam: displayAway,
    homeCrest,
    awayCrest,
    opponentName: isHome ? awayName : homeName,
    homeGoals: liveGoalsHome,
    awayGoals: liveGoalsAway,
    status: liveStatus,
    elapsed: liveElapsed,
    trackedAt: Date.now(),
  };

  await chrome.storage.local.set({ spark_tracked_matches: tracked });

  // Initialize prevGoals in session storage so the first poll doesn't fire a false goal notification
  const { prevGoals: pg, prevStatus: ps } = await _loadPrevState();
  pg[fixtureId] = liveGoalsHome + liveGoalsAway;
  ps[fixtureId] = liveStatus;
  await _savePrevState(pg, ps);

  ensurePollingAlarm();

  // Immediately broadcast so badges appear on all tabs right away
  broadcastLiveScores(tracked);

  // Send a "tracking started" confirmation notification
  const scoreStr = `${homeName} ${liveGoalsHome} - ${liveGoalsAway} ${awayName}`;
  queueNotification({
    type: "tracking_started",
    headline: randomFrom(HEADLINES.tracking_started),
    sub: randomFrom(SUB_MESSAGES.tracking_started),
    score: scoreStr,
    elapsed: String(liveElapsed || ""),
  });

  console.log(`[Spark AI SW] Tracking: ${homeName} vs ${awayName} (fixture ${fixtureId}, team: ${teamName})`);
  return { success: true, tracked: tracked[fixtureId] };
}

async function handleUntrackMatch(fixtureId) {
  const stored = await chrome.storage.local.get(["spark_tracked_matches"]);
  const tracked = stored.spark_tracked_matches || {};
  delete tracked[fixtureId];
  await chrome.storage.local.set({ spark_tracked_matches: tracked });

  if (Object.keys(tracked).length === 0) {
    chrome.alarms.clear("spark-live-poll");
    console.log("[Spark AI SW] No more tracked matches, polling stopped");
  }

  console.log(`[Spark AI SW] Untracked fixture ${fixtureId}`);
  return { success: true };
}

async function getTrackedMatches() {
  const stored = await chrome.storage.local.get(["spark_tracked_matches"]);
  return { tracked: stored.spark_tracked_matches || {} };
}

function ensurePollingAlarm() {
  chrome.alarms.get("spark-live-poll", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("spark-live-poll", {
        delayInMinutes: 0.5,
        periodInMinutes: 1,
      });
      // Also do an immediate poll
      pollLiveMatches();
      console.log("[Spark AI SW] Live polling alarm created");
    }
  });
}


// --- Live polling & goal detection ---

// IMPORTANT: prevGoals and prevStatus are stored in chrome.storage.session
// so they persist across service worker restarts (SW gets killed after ~30s idle).
// Without this, goal detection NEVER works because prevGoals is always empty
// when the SW wakes up for the 1-minute alarm.

async function _loadPrevState() {
  try {
    const s = await chrome.storage.session.get(["spark_prev_goals", "spark_prev_status"]);
    return {
      prevGoals: s.spark_prev_goals || {},
      prevStatus: s.spark_prev_status || {},
    };
  } catch (e) {
    console.warn("[Spark AI SW] Could not load session state:", e.message);
    return { prevGoals: {}, prevStatus: {} };
  }
}

async function _savePrevState(prevGoals, prevStatus) {
  try {
    await chrome.storage.session.set({
      spark_prev_goals: prevGoals,
      spark_prev_status: prevStatus,
    });
  } catch (e) {
    console.warn("[Spark AI SW] Could not save session state:", e.message);
  }
}

function _fuzzyTeamMatch(apiName, trackedName) {
  if (!apiName || !trackedName) return false;
  const a = apiName.toLowerCase().trim();
  const b = trackedName.toLowerCase().trim();
  return a === b || a.includes(b) || b.includes(a);
}

async function pollLiveMatches() {
  const stored = await chrome.storage.local.get(["spark_tracked_matches"]);
  const tracked = stored.spark_tracked_matches || {};
  const trackedIds = Object.keys(tracked);

  if (trackedIds.length === 0) {
    chrome.alarms.clear("spark-live-poll");
    return;
  }

  // Load previous goals/status from session storage (persists across SW restarts)
  const { prevGoals, prevStatus } = await _loadPrevState();

  console.log(`[Spark AI SW] Polling live matches for ${trackedIds.length} tracked fixture(s), prevGoals keys: ${Object.keys(prevGoals).length}`);

  let apiMatches;
  try {
    const resp = await fetch(`${API_BASE}/api/live-matches`);
    if (!resp.ok) {
      console.warn("[Spark AI SW] Live matches API returned", resp.status);
      return;
    }
    const data = await resp.json();
    apiMatches = data.matches || [];
  } catch (e) {
    console.error("[Spark AI SW] Live poll error:", e.message);
    return;
  }

  const apiMap = {};
  for (const m of apiMatches) apiMap[m.id] = m;

  let anyUpdated = false;

  for (const fid of trackedIds) {
    const tm = tracked[fid]; // tracked match
    let am = apiMap[fid];    // api match

    // Try to resolve pending fixture IDs (or unmatched IDs) via fuzzy name matching
    if (!am) {
      const found = apiMatches.find(m =>
        _fuzzyTeamMatch(m.home_team?.name, tm.homeTeam) &&
        _fuzzyTeamMatch(m.away_team?.name, tm.awayTeam)
      );
      if (found) {
        if (String(fid).startsWith("pending_")) {
          // Migrate to real fixture ID
          delete tracked[fid];
          // Carry forward prev state under the new ID
          if (prevGoals[fid] !== undefined) {
            prevGoals[found.id] = prevGoals[fid];
            delete prevGoals[fid];
          }
          if (prevStatus[fid] !== undefined) {
            prevStatus[found.id] = prevStatus[fid];
            delete prevStatus[fid];
          }
          tracked[found.id] = { ...tm, fixtureId: found.id };
          anyUpdated = true;
          console.log(`[Spark AI SW] Resolved pending fixture → ${found.id}`);
        }
        am = found;
      }
    }

    if (!am) continue;

    const homeGoals = am.goals?.home ?? 0;
    const awayGoals = am.goals?.away ?? 0;
    const totalGoals = homeGoals + awayGoals;
    const currentStatus = am.status;
    const elapsed = am.elapsed || 0;
    const effectiveFid = am.id || fid;

    // --- Goal Detection ---
    const prevTotal = prevGoals[effectiveFid];
    if (prevTotal !== undefined && totalGoals > prevTotal) {
      // A goal was scored!
      const userGoals = tm.isHome ? homeGoals : awayGoals;
      const oppGoals = tm.isHome ? awayGoals : homeGoals;
      const prevUserGoals = tm.isHome ? (tm.homeGoals ?? 0) : (tm.awayGoals ?? 0);
      const prevOppGoals = tm.isHome ? (tm.awayGoals ?? 0) : (tm.homeGoals ?? 0);

      let notifType;
      if (userGoals > prevUserGoals) {
        notifType = (userGoals - oppGoals >= 2) ? "big_lead" : "celebration";
      } else if (oppGoals > prevOppGoals) {
        notifType = (userGoals === oppGoals) ? "worried" : "sad";
      } else {
        notifType = "celebration";
      }

      const scoreStr = `${tm.homeTeam} ${homeGoals} - ${awayGoals} ${tm.awayTeam}`;
      queueNotification({
        type: notifType,
        headline: randomFrom(HEADLINES[notifType]),
        sub: randomFrom(SUB_MESSAGES[notifType]),
        score: scoreStr,
        elapsed: String(elapsed),
      });

      console.log(`[Spark AI SW] GOAL in ${tm.homeTeam} vs ${tm.awayTeam}: ${homeGoals}-${awayGoals} (${notifType})`);
    }

    // --- Match End Detection ---
    const wasLive = LIVE_STATUSES.has(prevStatus[effectiveFid]);
    const isNowFinished = FINISHED_STATUSES.has(currentStatus);

    if (wasLive && isNowFinished) {
      const userGoals = tm.isHome ? homeGoals : awayGoals;
      const oppGoals = tm.isHome ? awayGoals : homeGoals;

      let notifType;
      if (userGoals > oppGoals) notifType = "match_won";
      else if (userGoals < oppGoals) notifType = "match_lost";
      else notifType = "match_draw";

      const scoreStr = `${tm.homeTeam} ${homeGoals} - ${awayGoals} ${tm.awayTeam}`;
      queueNotification({
        type: notifType,
        headline: randomFrom(HEADLINES[notifType]),
        sub: randomFrom(SUB_MESSAGES[notifType]),
        score: scoreStr,
        elapsed: currentStatus,
      });

      // Auto-untrack finished matches
      const efid = tracked[effectiveFid] ? effectiveFid : fid;
      delete tracked[efid];
      anyUpdated = true;
      console.log(`[Spark AI SW] Match ended: ${tm.homeTeam} vs ${tm.awayTeam} (${notifType})`);
    }

    // Update stored state (persisted to session storage below)
    prevGoals[effectiveFid] = totalGoals;
    prevStatus[effectiveFid] = currentStatus;

    const tfid = tracked[effectiveFid] ? effectiveFid : fid;
    if (tracked[tfid]) {
      tracked[tfid].homeGoals = homeGoals;
      tracked[tfid].awayGoals = awayGoals;
      tracked[tfid].status = currentStatus;
      tracked[tfid].elapsed = elapsed;
      anyUpdated = true;
    }
  }

  // Persist prev state to session storage (survives SW restarts)
  await _savePrevState(prevGoals, prevStatus);

  if (anyUpdated) {
    await chrome.storage.local.set({ spark_tracked_matches: tracked });
  }

  // Broadcast live scores to all content script tabs
  broadcastLiveScores(tracked);

  // Stop polling if no tracked matches remain
  if (Object.keys(tracked).length === 0) {
    chrome.alarms.clear("spark-live-poll");
    console.log("[Spark AI SW] All matches ended, polling stopped");
  }
}

function broadcastLiveScores(tracked) {
  const message = { type: "LIVE_SCORE_UPDATE", tracked };
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}


// --- Notification queue & popup window ---

const notificationQueue = [];
let isShowingNotification = false;

function queueNotification(notifData) {
  notificationQueue.push(notifData);
  processNotificationQueue();
}

async function processNotificationQueue() {
  if (isShowingNotification || notificationQueue.length === 0) return;

  isShowingNotification = true;
  const notif = notificationQueue.shift();

  try {
    const params = new URLSearchParams({
      type: notif.type,
      headline: notif.headline,
      sub: notif.sub,
      score: notif.score,
      elapsed: notif.elapsed || "",
    });

    const notifUrl = chrome.runtime.getURL(`notification/goal-notification.html?${params.toString()}`);

    chrome.windows.create({
      url: notifUrl,
      type: "popup",
      width: 420,
      height: 370,
      focused: true,
    }, (win) => {
      if (chrome.runtime.lastError) {
        console.warn("[Spark AI SW] Popup failed:", chrome.runtime.lastError.message);
        showFallbackNotification(notif);
      }
    });
  } catch (e) {
    console.error("[Spark AI SW] Notification error:", e);
    showFallbackNotification(notif);
  }

  // Wait 9 seconds before showing next notification
  setTimeout(() => {
    isShowingNotification = false;
    processNotificationQueue();
  }, 9000);
}

function showFallbackNotification(notif) {
  chrome.notifications.create(`spark-goal-${Date.now()}`, {
    type: "basic",
    iconUrl: "assets/icon128.png",
    title: notif.headline,
    message: `${notif.score}\n${notif.sub}`,
    priority: 2,
  });
}


// --- Restore polling on service worker startup ---
(async () => {
  const stored = await chrome.storage.local.get(["spark_tracked_matches"]);
  const tracked = stored.spark_tracked_matches || {};
  if (Object.keys(tracked).length > 0) {
    console.log(`[Spark AI SW] Restoring polling for ${Object.keys(tracked).length} tracked match(es)`);
    ensurePollingAlarm();
  }
})();
