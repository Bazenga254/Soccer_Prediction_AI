/**
 * Spark AI - Full Analysis Panel Overlay
 * Shadow DOM side panel showing COMPLETE prediction results.
 * Matches the website's full pro prediction experience.
 */

const SparkAnalysisPanel = (() => {
  let hostEl = null;
  let shadowRoot = null;
  let panelEl = null;

  function init() {
    if (hostEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "spark-ai-panel-host";
    hostEl.style.cssText = "all: initial; position: fixed; top: 0; right: 0; width: 0; height: 100vh; z-index: 2147483647; pointer-events: none;";
    document.body.appendChild(hostEl);

    shadowRoot = hostEl.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = getPanelCSS();
    shadowRoot.appendChild(style);

    panelEl = document.createElement("div");
    panelEl.className = "spark-panel";
    shadowRoot.appendChild(panelEl);

    const backdrop = document.createElement("div");
    backdrop.className = "spark-backdrop";
    backdrop.addEventListener("click", hide);
    shadowRoot.insertBefore(backdrop, panelEl);
  }

  // Store current match info for live score updates
  let _currentPanelHome = "";
  let _currentPanelAway = "";
  let _liveScoreInterval = null;

  function show(prediction, matchInfo) {
    init();
    _currentPanelHome = (prediction.match_info?.team_a?.name || matchInfo.homeTeam || "").toLowerCase();
    _currentPanelAway = (prediction.match_info?.team_b?.name || matchInfo.awayTeam || "").toLowerCase();

    panelEl.innerHTML = buildPanelHTML(prediction, matchInfo);
    panelEl.classList.add("open");
    shadowRoot.querySelector(".spark-backdrop").classList.add("open");
    hostEl.style.width = "100vw";
    hostEl.style.pointerEvents = "auto";

    panelEl.querySelector(".spark-close-btn")?.addEventListener("click", hide);

    console.log("[Spark AI Panel] show() called, home:", _currentPanelHome, "away:", _currentPanelAway);

    // Try to show live score with cached data immediately
    updatePanelLiveScore(window._sparkTrackedMatches || {});

    // Also fetch fresh data from service worker (cache may be stale)
    const _fetchAndUpdate = () => {
      try {
        chrome.runtime.sendMessage({ type: "GET_TRACKED_MATCHES" }).then(resp => {
          if (resp?.tracked) {
            window._sparkTrackedMatches = resp.tracked;
            updatePanelLiveScore(resp.tracked);
          }
        }).catch(() => {});
      } catch (e) {}
    };
    _fetchAndUpdate();
    setTimeout(_fetchAndUpdate, 2000); // Retry in case SW was sleeping

    // Periodic retry while panel is open (catches late-arriving data or broadcasts)
    if (_liveScoreInterval) clearInterval(_liveScoreInterval);
    _liveScoreInterval = setInterval(() => {
      updatePanelLiveScore(window._sparkTrackedMatches || {});
    }, 3000);

    // Collapsible sections
    panelEl.querySelectorAll(".section-header").forEach((hdr) => {
      hdr.addEventListener("click", () => {
        const content = hdr.nextElementSibling;
        const arrow = hdr.querySelector(".section-arrow");
        if (content.style.display === "none") {
          content.style.display = "block";
          arrow.textContent = "▾";
        } else {
          content.style.display = "none";
          arrow.textContent = "▸";
        }
      });
    });
  }

  /** Update the live score banner inside the open panel (called by content.js on LIVE_SCORE_UPDATE) */
  function updatePanelLiveScore(tracked) {
    if (!panelEl || !_currentPanelHome) {
      console.log("[Spark AI Panel] updatePanelLiveScore skip: panelEl=", !!panelEl, "home=", _currentPanelHome);
      return;
    }

    // Try panelEl first, then shadowRoot as fallback
    let scoreEl = panelEl.querySelector(".spark-panel-live-score");
    if (!scoreEl && shadowRoot) {
      scoreEl = shadowRoot.querySelector(".spark-panel-live-score");
    }
    if (!scoreEl) {
      console.log("[Spark AI Panel] Live score element NOT found in panel DOM");
      return;
    }

    const entries = Object.entries(tracked);
    if (entries.length === 0) return;

    for (const [fid, tData] of entries) {
      const tNames = [tData.homeTeam, tData.displayHomeTeam].filter(Boolean).map(n => n.toLowerCase());
      const aNames = [tData.awayTeam, tData.displayAwayTeam].filter(Boolean).map(n => n.toLowerCase());
      const homeHit = tNames.some(n => n.includes(_currentPanelHome) || _currentPanelHome.includes(n));
      const awayHit = aNames.some(n => n.includes(_currentPanelAway) || _currentPanelAway.includes(n));

      if (homeHit && awayHit) {
        const LIVE = ["1H", "2H", "HT", "ET", "LIVE"];
        const FINISHED = ["FT", "AET", "PEN"];
        console.log("[Spark AI Panel] Matched fixture:", fid, "status:", tData.status, "score:", tData.homeGoals, "-", tData.awayGoals);

        if (LIVE.includes(tData.status)) {
          const elapsedText = tData.elapsed ? tData.elapsed + "'" : "LIVE";
          scoreEl.style.display = "flex";
          scoreEl.className = "spark-panel-live-score";
          scoreEl.innerHTML = `<span class="spark-panel-live-dot"></span><span class="spark-panel-live-time">${elapsedText}</span><span class="spark-panel-live-goals">${tData.homeGoals ?? 0} - ${tData.awayGoals ?? 0}</span>`;
        } else if (FINISHED.includes(tData.status)) {
          scoreEl.style.display = "flex";
          scoreEl.className = "spark-panel-live-score finished";
          scoreEl.innerHTML = `<span class="spark-panel-ft-badge">${tData.status}</span><span class="spark-panel-live-goals">${tData.homeGoals ?? 0} - ${tData.awayGoals ?? 0}</span>`;
        } else {
          console.log("[Spark AI Panel] Match found but status not live/finished:", tData.status);
        }
        break;
      }
    }
  }

  function hide() {
    if (!panelEl) return;
    if (_liveScoreInterval) { clearInterval(_liveScoreInterval); _liveScoreInterval = null; }
    panelEl.classList.remove("open");
    shadowRoot.querySelector(".spark-backdrop")?.classList.remove("open");
    setTimeout(() => {
      if (hostEl) {
        hostEl.style.width = "0";
        hostEl.style.pointerEvents = "none";
      }
    }, 300);
  }

  // === HELPERS ===
  function pct(v) { return (v || 0).toFixed(1); }
  function safe(v, d) { return v != null ? v : d; }

  function sectionWrap(title, contentHTML, open = true) {
    return `
      <div class="section-header">
        <span>${title}</span>
        <span class="section-arrow">${open ? "▾" : "▸"}</span>
      </div>
      <div class="section-content" style="display:${open ? "block" : "none"}">
        ${contentHTML}
      </div>`;
  }

  // === BUILD FULL HTML ===
  function buildPanelHTML(pred, matchInfo) {
    const outcome = pred.outcome || {};
    const players = pred.players || {};
    const risks = pred.risks || [];
    const dataSources = pred.data_sources || {};
    const mi = pred.match_info || {};
    const analysis = outcome.analysis || {};

    const home = mi.team_a?.name || matchInfo.homeTeam;
    const away = mi.team_b?.name || matchInfo.awayTeam;
    const homeCrest = mi.team_a?.crest || "";
    const awayCrest = mi.team_b?.crest || "";
    const comp = mi.competition || matchInfo.competition || "";

    const homeWin = pct(outcome.team_a_win);
    const draw = pct(outcome.draw);
    const awayWin = pct(outcome.team_b_win);
    const confidence = outcome.confidence || "Medium";
    const confColor = confidence === "High" ? "#22c55e" : confidence === "Medium" ? "#f59e0b" : "#ef4444";

    const h2h = outcome.h2h_summary || {};
    const factors = outcome.key_factors || [];
    let sections = "";

    // 1. FORM ANALYSIS
    if (analysis.form_a != null || analysis.form_b != null) {
      sections += sectionWrap("Form Analysis", `
        <div class="form-row">
          <span class="form-team">${home}</span>
          <div class="form-bar-wrap">
            <div class="form-bar" style="width:${pct(analysis.form_a)}%;background:#22c55e"></div>
          </div>
          <span class="form-pct">${pct(analysis.form_a)}%</span>
        </div>
        <div class="form-row">
          <span class="form-team">${away}</span>
          <div class="form-bar-wrap">
            <div class="form-bar" style="width:${pct(analysis.form_b)}%;background:#3b82f6"></div>
          </div>
          <span class="form-pct">${pct(analysis.form_b)}%</span>
        </div>
        ${analysis.goals_strength_a != null ? `
        <div class="form-sub-title">Goal Strength</div>
        <div class="form-row">
          <span class="form-team">${home}</span>
          <div class="form-bar-wrap">
            <div class="form-bar" style="width:${pct(analysis.goals_strength_a)}%;background:#f59e0b"></div>
          </div>
          <span class="form-pct">${pct(analysis.goals_strength_a)}%</span>
        </div>
        <div class="form-row">
          <span class="form-team">${away}</span>
          <div class="form-bar-wrap">
            <div class="form-bar" style="width:${pct(analysis.goals_strength_b)}%;background:#f59e0b"></div>
          </div>
          <span class="form-pct">${pct(analysis.goals_strength_b)}%</span>
        </div>` : ""}
      `);
    }

    // 2. DOUBLE CHANCE
    const dc12 = parseFloat(homeWin) + parseFloat(awayWin);
    const dc1x = parseFloat(homeWin) + parseFloat(draw);
    const dcx2 = parseFloat(draw) + parseFloat(awayWin);
    sections += sectionWrap("Double Chance", `
      <div class="dc-grid">
        <div class="dc-item"><div class="dc-label">1X (${home} or Draw)</div><div class="dc-val">${dc1x.toFixed(1)}%</div></div>
        <div class="dc-item"><div class="dc-label">X2 (Draw or ${away})</div><div class="dc-val">${dcx2.toFixed(1)}%</div></div>
        <div class="dc-item"><div class="dc-label">12 (${home} or ${away})</div><div class="dc-val">${dc12.toFixed(1)}%</div></div>
      </div>
    `, false);

    // 3. BOTH TEAMS TO SCORE (BTTS)
    const bttsOdds = pred.odds?.btts;
    let bttsYes = null, bttsNo = null;
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
    if (bttsYes == null && (analysis.goals_strength_a != null || analysis.goals_strength_b != null)) {
      const offA = (analysis.goals_strength_a || 50) / 100;
      const offB = (analysis.goals_strength_b || 50) / 100;
      bttsYes = Math.min(85, Math.max(20, (offA * 0.5 + offB * 0.5) * 100 + 10));
      bttsNo = 100 - bttsYes;
    }
    if (bttsYes != null) {
      const bttsPick = bttsYes >= bttsNo ? "Yes (GG)" : "No (NG)";
      const bttsPickProb = Math.max(bttsYes, bttsNo);
      sections += sectionWrap("Both Teams to Score", `
        <div class="market-bars">
          <div class="market-bar-row ${bttsYes >= bttsNo ? 'best' : ''}">
            <span class="market-bar-label">Yes (GG)</span>
            <div class="market-bar-track"><div class="market-bar-fill yes" style="width:${bttsYes.toFixed(0)}%"></div></div>
            <span class="market-bar-val">${bttsYes.toFixed(1)}%</span>
          </div>
          <div class="market-bar-row ${bttsNo > bttsYes ? 'best' : ''}">
            <span class="market-bar-label">No (NG)</span>
            <div class="market-bar-track"><div class="market-bar-fill no" style="width:${bttsNo.toFixed(0)}%"></div></div>
            <span class="market-bar-val">${bttsNo.toFixed(1)}%</span>
          </div>
        </div>
        <div class="market-pick">AI Pick: <strong>${bttsPick}</strong> (${bttsPickProb.toFixed(1)}%)</div>
      `);
    }

    // 4. OVER/UNDER 2.5 GOALS
    const ouOdds = pred.odds?.over_under;
    let over25 = null, under25 = null;
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
    if (over25 == null && (analysis.goals_strength_a != null || analysis.goals_strength_b != null)) {
      const combined = ((analysis.goals_strength_a || 50) + (analysis.goals_strength_b || 50)) / 2;
      over25 = Math.min(80, Math.max(25, combined + 5));
      under25 = 100 - over25;
    }
    if (over25 != null) {
      const ouPick = over25 >= under25 ? "Over 2.5 Goals" : "Under 2.5 Goals";
      const ouPickProb = Math.max(over25, under25);
      sections += sectionWrap("Over/Under 2.5 Goals", `
        <div class="market-bars">
          <div class="market-bar-row ${over25 >= under25 ? 'best' : ''}">
            <span class="market-bar-label">Over 2.5</span>
            <div class="market-bar-track"><div class="market-bar-fill over" style="width:${over25.toFixed(0)}%"></div></div>
            <span class="market-bar-val">${over25.toFixed(1)}%</span>
          </div>
          <div class="market-bar-row ${under25 > over25 ? 'best' : ''}">
            <span class="market-bar-label">Under 2.5</span>
            <div class="market-bar-track"><div class="market-bar-fill under" style="width:${under25.toFixed(0)}%"></div></div>
            <span class="market-bar-val">${under25.toFixed(1)}%</span>
          </div>
        </div>
        <div class="market-pick">AI Pick: <strong>${ouPick}</strong> (${ouPickProb.toFixed(1)}%)</div>
      `);
    }

    // 5. GOALS ANALYSIS
    if (h2h.total && (h2h.a_goals != null || h2h.b_goals != null)) {
      const totalGoals = (h2h.a_goals || 0) + (h2h.b_goals || 0);
      const avgGoals = h2h.total > 0 ? (totalGoals / h2h.total).toFixed(2) : "0.00";
      const avgHome = h2h.total > 0 ? ((h2h.a_goals || 0) / h2h.total).toFixed(2) : "0.00";
      const avgAway = h2h.total > 0 ? ((h2h.b_goals || 0) / h2h.total).toFixed(2) : "0.00";
      sections += sectionWrap("Goals Analysis", `
        <div class="goals-stats">
          <div class="goals-stat">
            <div class="goals-val">${avgGoals}</div>
            <div class="goals-lbl">Avg Goals/Match</div>
          </div>
          <div class="goals-stat">
            <div class="goals-val">${avgHome}</div>
            <div class="goals-lbl">${home} Avg</div>
          </div>
          <div class="goals-stat">
            <div class="goals-val">${avgAway}</div>
            <div class="goals-lbl">${away} Avg</div>
          </div>
        </div>
      `, false);
    }

    // 6. ODDS COMPARISON (from pred.odds.outcomes)
    const oddsOutcomes = pred.odds?.outcomes;
    if (oddsOutcomes) {
      const homeOdds = oddsOutcomes.team_a_win?.odds || [];
      const drawOdds = oddsOutcomes.draw?.odds || [];
      const awayOdds = oddsOutcomes.team_b_win?.odds || [];

      // Merge by bookmaker name
      const bookmakers = {};
      for (const o of homeOdds) { bookmakers[o.bookmaker] = { ...bookmakers[o.bookmaker], bookmaker: o.bookmaker, home: o.odds }; }
      for (const o of drawOdds) { bookmakers[o.bookmaker] = { ...bookmakers[o.bookmaker], bookmaker: o.bookmaker, draw: o.odds }; }
      for (const o of awayOdds) { bookmakers[o.bookmaker] = { ...bookmakers[o.bookmaker], bookmaker: o.bookmaker, away: o.odds }; }
      const bkList = Object.values(bookmakers).filter(b => b.home && b.draw && b.away).slice(0, 5);

      if (bkList.length) {
        let oddsHTML = '<div class="odds-table">';
        oddsHTML += '<div class="odds-header"><span>Bookmaker</span><span>1</span><span>X</span><span>2</span></div>';
        for (const bk of bkList) {
          oddsHTML += `<div class="odds-row">
            <span class="odds-bk">${bk.bookmaker}</span>
            <span class="odds-val">${bk.home.toFixed(2)}</span>
            <span class="odds-val">${bk.draw.toFixed(2)}</span>
            <span class="odds-val">${bk.away.toFixed(2)}</span>
          </div>`;
        }
        oddsHTML += '</div>';

        // Show recommendation if available
        const rec = pred.odds?.recommendation;
        if (rec?.label) {
          oddsHTML += `<div class="market-pick">Best Value: <strong>${rec.label}</strong> @ ${rec.bookmaker} (${(rec.odds || 0).toFixed(2)}) ${rec.has_value ? '&#9989;' : ''}</div>`;
        }
        sections += sectionWrap("Odds Comparison", oddsHTML, false);
      }
    }

    // === EXTENDED DATA FROM H2H ANALYSIS ===
    const h2hData = pred._h2h_analysis;
    const statsData = pred._match_stats;
    const resultAnalysis = h2hData?.result_analysis;
    const goalsAnalysisH2H = h2hData?.goals_analysis;

    // 7. CORRECT SCORE PREDICTION
    if (resultAnalysis?.correct_score) {
      const cs = resultAnalysis.correct_score;
      const sorted = Object.entries(cs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (sorted.length) {
        let csHTML = '<div class="cs-grid">';
        for (const [score, prob] of sorted) {
          const isBest = sorted[0][0] === score;
          csHTML += `<div class="cs-item${isBest ? ' best' : ''}"><span class="cs-score">${score}</span><span class="cs-prob">${prob.toFixed(1)}%</span></div>`;
        }
        csHTML += '</div>';
        sections += sectionWrap("Correct Score", csHTML, false);
      }
    }

    // 8. HALFTIME/FULLTIME
    if (resultAnalysis?.htft) {
      const htft = resultAnalysis.htft;
      const htftEntries = Object.entries(htft).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (htftEntries.length) {
        const labels = {"1/1": `${home}/${home}`, "1/x": `${home}/Draw`, "1/2": `${home}/${away}`,
          "x/1": `Draw/${home}`, "x/x": "Draw/Draw", "x/2": `Draw/${away}`,
          "2/1": `${away}/${home}`, "2/x": `${away}/Draw`, "2/2": `${away}/${away}`};
        let htftHTML = '<div class="htft-grid">';
        for (const [key, prob] of htftEntries.slice(0, 6)) {
          const isBest = htftEntries[0][0] === key;
          htftHTML += `<div class="htft-item${isBest ? ' best' : ''}"><span class="htft-label">${labels[key] || key}</span><span class="htft-prob">${prob.toFixed(1)}%</span></div>`;
        }
        htftHTML += '</div>';
        sections += sectionWrap("Halftime / Fulltime", htftHTML, false);
      }
    }

    // 9. HANDICAP
    if (resultAnalysis?.handicap) {
      const hcap = resultAnalysis.handicap;
      const hcEntries = Object.entries(hcap);
      if (hcEntries.length) {
        let hcHTML = '<div class="odds-table">';
        hcHTML += `<div class="odds-header"><span>Handicap</span><span>${home}</span><span>Draw</span><span>${away}</span></div>`;
        for (const [offset, vals] of hcEntries) {
          const sign = parseInt(offset) > 0 ? "+" : "";
          hcHTML += `<div class="odds-row">
            <span class="odds-bk">${sign}${offset}</span>
            <span class="odds-val">${(vals.team_a || 0).toFixed(1)}%</span>
            <span class="odds-val">${(vals.draw || 0).toFixed(1)}%</span>
            <span class="odds-val">${(vals.team_b || 0).toFixed(1)}%</span>
          </div>`;
        }
        hcHTML += '</div>';
        sections += sectionWrap("Asian Handicap", hcHTML, false);
      }
    }

    // 10. OVER/UNDER EXTENDED (from H2H analysis)
    if (goalsAnalysisH2H?.over_under) {
      const ou = goalsAnalysisH2H.over_under;
      const ouLines = [
        { label: "Over 0.5", data: ou.over_05 },
        { label: "Over 1.5", data: ou.over_15 },
        { label: "Over 2.5", data: ou.over_25 },
        { label: "Over 3.5", data: ou.over_35 },
        { label: "Over 4.5", data: ou.over_45 },
      ].filter(l => l.data);
      if (ouLines.length > 1) {
        let ouExtHTML = '<div class="market-bars">';
        for (const line of ouLines) {
          const pctVal = line.data.percentage || 0;
          ouExtHTML += `<div class="market-bar-row${pctVal >= 50 ? ' best' : ''}">
            <span class="market-bar-label">${line.label}</span>
            <div class="market-bar-track"><div class="market-bar-fill over" style="width:${pctVal}%"></div></div>
            <span class="market-bar-val">${pctVal.toFixed(0)}%</span>
          </div>`;
        }
        ouExtHTML += '</div>';
        sections += sectionWrap("Goals Over/Under (H2H)", ouExtHTML, false);
      }
    }

    // 11. CORNER ANALYSIS
    if (statsData?.corner_analysis) {
      const ca = statsData.corner_analysis;
      let cornerHTML = '';
      if (ca.expected_total != null) {
        cornerHTML += `<div class="goals-stats">
          <div class="goals-stat"><div class="goals-val">${(ca.expected_total || 0).toFixed(1)}</div><div class="goals-lbl">Expected Total</div></div>
          <div class="goals-stat"><div class="goals-val">${(ca.team_a_expected || 0).toFixed(1)}</div><div class="goals-lbl">${home}</div></div>
          <div class="goals-stat"><div class="goals-val">${(ca.team_b_expected || 0).toFixed(1)}</div><div class="goals-lbl">${away}</div></div>
        </div>`;
      }
      const cOU = ca.over_under;
      if (cOU) {
        cornerHTML += '<div class="market-bars" style="margin-top:8px">';
        for (const [key, data] of Object.entries(cOU)) {
          const label = key.replace("over_", "Over ").replace("5", ".5");
          const pctVal = data.percentage || 0;
          cornerHTML += `<div class="market-bar-row${pctVal >= 50 ? ' best' : ''}">
            <span class="market-bar-label">${label}</span>
            <div class="market-bar-track"><div class="market-bar-fill over" style="width:${pctVal}%"></div></div>
            <span class="market-bar-val">${pctVal.toFixed(0)}%</span>
          </div>`;
        }
        cornerHTML += '</div>';
      }
      if (cornerHTML) sections += sectionWrap("Corner Analysis", cornerHTML, false);
    }

    // 12. CARD ANALYSIS
    if (statsData?.card_analysis) {
      const cardA = statsData.card_analysis;
      let cardHTML = '';
      if (cardA.expected_yellow_cards != null) {
        cardHTML += `<div class="goals-stats">
          <div class="goals-stat"><div class="goals-val">${(cardA.expected_yellow_cards || 0).toFixed(1)}</div><div class="goals-lbl">Expected Yellows</div></div>
          <div class="goals-stat"><div class="goals-val">${(cardA.team_a?.yellow_per_match || 0).toFixed(1)}</div><div class="goals-lbl">${home}/Match</div></div>
          <div class="goals-stat"><div class="goals-val">${(cardA.team_b?.yellow_per_match || 0).toFixed(1)}</div><div class="goals-lbl">${away}/Match</div></div>
        </div>`;
      }
      const crdOU = cardA.over_under;
      if (crdOU) {
        cardHTML += '<div class="market-bars" style="margin-top:8px">';
        for (const [key, data] of Object.entries(crdOU)) {
          const label = key.replace("over_", "Over ").replace("_cards", "").replace("5", ".5");
          const pctVal = data.percentage || 0;
          cardHTML += `<div class="market-bar-row${pctVal >= 50 ? ' best' : ''}">
            <span class="market-bar-label">${label}</span>
            <div class="market-bar-track"><div class="market-bar-fill over" style="width:${pctVal}%"></div></div>
            <span class="market-bar-val">${pctVal.toFixed(0)}%</span>
          </div>`;
        }
        cardHTML += '</div>';
      }
      if (cardA.red_card_probability != null) {
        cardHTML += `<div class="market-pick">Red Card Probability: <strong>${(cardA.red_card_probability || 0).toFixed(1)}%</strong></div>`;
      }
      if (cardHTML) sections += sectionWrap("Card Analysis", cardHTML, false);
    }

    // 13. FIRST HALF ANALYSIS
    if (resultAnalysis?.first_half) {
      const fh = resultAnalysis.first_half;
      let fhHTML = '';
      if (fh["1x2"]) {
        fhHTML += `<div class="dc-grid">
          <div class="dc-item"><div class="dc-label">${home}</div><div class="dc-val">${(fh["1x2"].team_a || 0).toFixed(1)}%</div></div>
          <div class="dc-item"><div class="dc-label">Draw</div><div class="dc-val">${(fh["1x2"].draw || 0).toFixed(1)}%</div></div>
          <div class="dc-item"><div class="dc-label">${away}</div><div class="dc-val">${(fh["1x2"].team_b || 0).toFixed(1)}%</div></div>
        </div>`;
      }
      if (fh.btts) {
        fhHTML += `<div class="market-pick" style="margin-top:6px">BTTS 1H: <strong>${fh.btts.prediction}</strong> (Yes: ${(fh.btts.yes || 0).toFixed(1)}%)</div>`;
      }
      if (fhHTML) sections += sectionWrap("First Half Analysis", fhHTML, false);
    }

    // 14. PLAYER IMPACT
    const teamAPlayers = players.team_a || [];
    const teamBPlayers = players.team_b || [];

    if (teamAPlayers.length > 0 || teamBPlayers.length > 0) {
      let playerHTML = "";

      const renderPlayers = (teamPlayers, teamName) => {
        if (!teamPlayers.length) return "";
        let html = `<div class="player-team-title">${teamName}</div>`;
        for (const p of teamPlayers.slice(0, 5)) {
          const impactColor = (p.impact_score || 0) >= 7 ? "#22c55e" : (p.impact_score || 0) >= 5 ? "#f59e0b" : "#64748b";
          html += `
            <div class="player-row">
              ${p.photo ? `<img src="${p.photo}" class="player-photo" alt="">` : `<div class="player-photo-placeholder">${(p.name || "?")[0]}</div>`}
              <div class="player-info">
                <div class="player-name">${p.name || "Unknown"} <span class="player-pos">${p.position || ""}</span></div>
                <div class="player-stats">
                  ${p.goals ? `<span>&#9917; ${p.goals}G</span>` : ""}
                  ${p.assists ? `<span>&#127345;&#65039; ${p.assists}A</span>` : ""}
                  ${p.scoring_prob ? `<span class="prob-tag">Score: ${pct(p.scoring_prob)}%</span>` : ""}
                  ${p.assist_prob ? `<span class="prob-tag">Assist: ${pct(p.assist_prob)}%</span>` : ""}
                </div>
                <div class="player-meta">
                  ${p.card_risk ? `<span class="card-risk card-${(p.card_risk || "low").toLowerCase()}">${p.card_risk} card risk</span>` : ""}
                  ${p.impact_score ? `<span class="impact-badge" style="color:${impactColor}">Impact: ${p.impact_score.toFixed(1)}/10</span>` : ""}
                </div>
              </div>
            </div>`;
        }
        return html;
      };

      playerHTML = renderPlayers(teamAPlayers, home) + renderPlayers(teamBPlayers, away);
      sections += sectionWrap("Player Impact", playerHTML);
    } else {
      sections += sectionWrap("Player Impact", `
        <div class="no-data-msg">
          <div class="no-data-icon">&#9917;</div>
          <div class="no-data-title">Player data is currently unavailable for this fixture</div>
          <div class="no-data-desc">Detailed player statistics may not yet be published for this league or matchday. Please verify with the official league source for the latest squad and performance data.</div>
        </div>
      `);
    }

    // 15. HEAD-TO-HEAD
    if (h2h.total) {
      const totalGoals = (h2h.a_goals || 0) + (h2h.b_goals || 0);
      const avgGoals = h2h.total > 0 ? (totalGoals / h2h.total).toFixed(1) : "0.0";
      sections += sectionWrap("Head-to-Head", `
        <div class="h2h-stats">
          <div class="h2h-stat"><div class="h2h-val">${h2h.a_wins || 0}</div><div class="h2h-lbl">${home} Wins</div></div>
          <div class="h2h-stat"><div class="h2h-val">${h2h.draws || 0}</div><div class="h2h-lbl">Draws</div></div>
          <div class="h2h-stat"><div class="h2h-val">${h2h.b_wins || 0}</div><div class="h2h-lbl">${away} Wins</div></div>
        </div>
        <div class="h2h-extra">
          <span>${h2h.total} matches played</span>
          <span>${h2h.a_goals || 0} - ${h2h.b_goals || 0} total goals</span>
          <span>Avg ${avgGoals} goals/match</span>
        </div>
      `);
    }

    // 16. KEY FACTORS
    if (factors.length) {
      sections += sectionWrap("Key Factors", `<ul class="factors-list">${factors.map((f) => `<li>${f}</li>`).join("")}</ul>`);
    }

    // 17. RISK WARNINGS
    if (risks.length) {
      sections += sectionWrap("Risk Notes", `<div class="risks">${risks.map((r) => `<div class="risk-item risk-${r.severity || "info"}">${r.message}</div>`).join("")}</div>`, false);
    }

    // 18. DATA SOURCES
    if (Object.keys(dataSources).length) {
      let dsHTML = "";
      for (const [k, v] of Object.entries(dataSources)) {
        const isLive = (v || "").toLowerCase().includes("live");
        dsHTML += `<div class="ds-row"><span class="ds-key">${k}</span><span class="ds-val${isLive ? " live" : ""}">${v}</span></div>`;
      }
      sections += sectionWrap("Data Sources", `<div class="ds-list">${dsHTML}</div>`, false);
    }

    // Live score banner — always include hidden element so updatePanelLiveScore can populate it later
    let liveScoreHTML = '<div class="spark-panel-live-score" style="display:none"><span class="spark-panel-live-dot"></span><span class="spark-panel-live-time"></span><span class="spark-panel-live-goals"></span></div>';
    const tracked = window._sparkTrackedMatches || {};
    for (const [, tData] of Object.entries(tracked)) {
      const tNames = [tData.homeTeam, tData.displayHomeTeam].filter(Boolean).map(n => n.toLowerCase());
      const aNames = [tData.awayTeam, tData.displayAwayTeam].filter(Boolean).map(n => n.toLowerCase());
      const mh = home.toLowerCase();
      const ma = away.toLowerCase();
      const homeHit = tNames.some(n => n.includes(mh) || mh.includes(n));
      const awayHit = aNames.some(n => n.includes(ma) || ma.includes(n));
      if (homeHit && awayHit) {
        const LIVE = ["1H", "2H", "HT", "ET", "LIVE"];
        const FINISHED = ["FT", "AET", "PEN"];
        if (LIVE.includes(tData.status)) {
          const elapsedText = tData.elapsed ? tData.elapsed + "'" : "LIVE";
          liveScoreHTML = `
            <div class="spark-panel-live-score">
              <span class="spark-panel-live-dot"></span>
              <span class="spark-panel-live-time">${elapsedText}</span>
              <span class="spark-panel-live-goals">${tData.homeGoals ?? 0} - ${tData.awayGoals ?? 0}</span>
            </div>`;
        } else if (FINISHED.includes(tData.status)) {
          liveScoreHTML = `
            <div class="spark-panel-live-score finished">
              <span class="spark-panel-ft-badge">${tData.status}</span>
              <span class="spark-panel-live-goals">${tData.homeGoals ?? 0} - ${tData.awayGoals ?? 0}</span>
            </div>`;
        }
        break;
      }
    }

    // FINAL ASSEMBLY
    return `
      <button class="spark-close-btn">&times;</button>
      <div class="panel-scroll">
        <div class="panel-header">
          <div class="panel-logo"><img src="${chrome.runtime.getURL("assets/logo.png")}" class="panel-logo-img" alt="Spark AI"> Spark AI Analysis</div>
          ${comp ? `<div class="panel-comp">${comp}</div>` : ""}
        </div>

        <div class="teams-section">
          <div class="team-col">
            ${homeCrest ? `<img src="${homeCrest}" class="team-crest" alt="">` : ""}
            <div class="team-name">${home}</div>
            ${mi.team_a?.position ? `<div class="team-pos">#${mi.team_a.position} in table</div>` : ""}
          </div>
          <div class="vs-text">VS</div>
          <div class="team-col">
            ${awayCrest ? `<img src="${awayCrest}" class="team-crest" alt="">` : ""}
            <div class="team-name">${away}</div>
            ${mi.team_b?.position ? `<div class="team-pos">#${mi.team_b.position} in table</div>` : ""}
          </div>
        </div>

        ${liveScoreHTML}

        <div class="pred-bar-section">
          <div class="pred-bar">
            <div class="pred-segment home" style="width:${homeWin}%">${homeWin}%</div>
            <div class="pred-segment draw" style="width:${draw}%">${draw}%</div>
            <div class="pred-segment away" style="width:${awayWin}%">${awayWin}%</div>
          </div>
          <div class="pred-labels">
            <span>Home Win</span><span>Draw</span><span>Away Win</span>
          </div>
        </div>

        <div class="confidence-badge" style="border-color:${confColor};color:${confColor}">
          Confidence: ${confidence}
        </div>

        ${sections}

        <div class="powered-by"><img src="${chrome.runtime.getURL("assets/logo.png")}" class="powered-by-img" alt="Spark AI"> Powered by Spark AI</div>
      </div>
    `;
  }

  // === CSS ===
  function getPanelCSS() {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }

      .spark-backdrop {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0); transition: background 0.3s;
        pointer-events: none;
      }
      .spark-backdrop.open { background: rgba(0,0,0,0.5); pointer-events: auto; }

      .spark-panel {
        position: fixed; top: 0; right: -440px; width: 420px; height: 100vh;
        background: #0f172a; color: #e2e8f0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: right 0.3s ease; box-shadow: -4px 0 30px rgba(0,0,0,0.5);
        z-index: 999; overflow: hidden;
      }
      .spark-panel.open { right: 0; }

      .spark-close-btn {
        position: absolute; top: 12px; right: 14px; z-index: 10;
        background: none; border: none; color: #64748b; font-size: 24px;
        cursor: pointer; line-height: 1; padding: 4px;
      }
      .spark-close-btn:hover { color: #fff; }

      .panel-scroll {
        height: 100vh; overflow-y: auto; padding: 20px;
        scrollbar-width: thin; scrollbar-color: #334155 transparent;
      }

      .panel-header { margin-bottom: 20px; }
      .panel-logo { font-size: 18px; font-weight: 800; color: #f1f5f9; display: flex; align-items: center; gap: 8px; }
      .panel-logo-img { width: 32px; height: 32px; border-radius: 6px; object-fit: contain; }
      .panel-comp { font-size: 12px; color: #64748b; margin-top: 4px; }

      .teams-section {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 20px; gap: 12px;
      }
      .team-col { text-align: center; flex: 1; }
      .team-crest { width: 48px; height: 48px; object-fit: contain; margin-bottom: 6px; }
      .team-name { font-size: 14px; font-weight: 700; }
      .team-pos { font-size: 10px; color: #64748b; margin-top: 2px; }
      .vs-text { font-size: 12px; color: #64748b; font-weight: 600; }

      /* Live Score Banner */
      .spark-panel-live-score {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 10px; padding: 10px 16px; margin-bottom: 16px;
      }
      .spark-panel-live-score.finished {
        background: rgba(100, 116, 139, 0.1); border-color: rgba(100, 116, 139, 0.3);
      }
      .spark-panel-live-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #ef4444;
        animation: sparkPanelPulse 1.5s infinite;
      }
      @keyframes sparkPanelPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .spark-panel-live-time {
        font-size: 12px; font-weight: 700; color: #22c55e;
      }
      .spark-panel-live-score.finished .spark-panel-live-time { color: #94a3b8; }
      .spark-panel-ft-badge {
        font-size: 11px; font-weight: 700; color: #94a3b8;
        background: #334155; padding: 2px 8px; border-radius: 6px;
      }
      .spark-panel-live-goals {
        font-size: 24px; font-weight: 900; color: #f1f5f9; letter-spacing: 2px;
      }

      .pred-bar-section { margin-bottom: 16px; }
      .pred-bar { display: flex; height: 32px; border-radius: 8px; overflow: hidden; }
      .pred-segment {
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #fff; min-width: 40px;
      }
      .pred-segment.home { background: #22c55e; }
      .pred-segment.draw { background: #64748b; }
      .pred-segment.away { background: #ef4444; }
      .pred-labels { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-top: 4px; }

      .confidence-badge {
        display: inline-block; font-size: 12px; font-weight: 700;
        border: 1px solid; border-radius: 20px; padding: 4px 14px;
        margin-bottom: 16px;
      }

      /* Collapsible Sections */
      .section-header {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 11px; color: #94a3b8; text-transform: uppercase;
        letter-spacing: 0.8px; font-weight: 700;
        padding: 10px 0 6px; margin-top: 8px;
        cursor: pointer; user-select: none;
        border-bottom: 1px solid #1e293b;
      }
      .section-header:hover { color: #e2e8f0; }
      .section-arrow { font-size: 12px; }
      .section-content { padding: 10px 0 4px; }

      /* Form Analysis */
      .form-row {
        display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px;
      }
      .form-team { width: 70px; font-weight: 600; font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .form-bar-wrap { flex: 1; height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
      .form-bar { height: 100%; border-radius: 4px; transition: width 0.5s; }
      .form-pct { font-size: 11px; font-weight: 700; width: 42px; text-align: right; }
      .form-sub-title { font-size: 10px; color: #64748b; margin: 8px 0 4px; font-weight: 600; }

      /* Double Chance */
      .dc-grid { display: flex; gap: 8px; }
      .dc-item {
        flex: 1; background: #1e293b; border-radius: 8px; padding: 10px;
        text-align: center;
      }
      .dc-label { font-size: 10px; color: #94a3b8; margin-bottom: 4px; }
      .dc-val { font-size: 16px; font-weight: 800; color: #22c55e; }

      /* Market Bars (BTTS, Over/Under) */
      .market-bars { margin-bottom: 8px; }
      .market-bar-row {
        display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
        padding: 4px 6px; border-radius: 6px; transition: background 0.2s;
      }
      .market-bar-row.best { background: rgba(34,197,94,0.08); }
      .market-bar-label {
        width: 70px; font-size: 11px; font-weight: 600; color: #94a3b8;
        white-space: nowrap;
      }
      .market-bar-track {
        flex: 1; height: 10px; background: #1e293b; border-radius: 5px; overflow: hidden;
      }
      .market-bar-fill {
        height: 100%; border-radius: 5px; transition: width 0.6s ease;
      }
      .market-bar-fill.yes { background: linear-gradient(90deg, #22c55e, #4ade80); }
      .market-bar-fill.no { background: linear-gradient(90deg, #ef4444, #f87171); }
      .market-bar-fill.over { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
      .market-bar-fill.under { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
      .market-bar-val {
        width: 48px; text-align: right; font-size: 12px; font-weight: 700; color: #e2e8f0;
      }
      .market-pick {
        font-size: 12px; color: #94a3b8; padding: 6px 10px;
        background: #1e293b; border-radius: 6px; margin-top: 4px;
      }
      .market-pick strong { color: #22c55e; }

      /* Goals Analysis */
      .goals-stats { display: flex; gap: 8px; }
      .goals-stat {
        flex: 1; text-align: center; background: #1e293b; border-radius: 8px; padding: 12px 6px;
      }
      .goals-val { font-size: 20px; font-weight: 800; color: #60a5fa; }
      .goals-lbl { font-size: 10px; color: #64748b; margin-top: 4px; }

      /* Correct Score */
      .cs-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      }
      .cs-item {
        background: #1e293b; border-radius: 6px; padding: 8px 4px;
        text-align: center; transition: background 0.2s;
      }
      .cs-item.best { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); }
      .cs-score { display: block; font-size: 14px; font-weight: 800; color: #f1f5f9; }
      .cs-prob { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
      .cs-item.best .cs-prob { color: #22c55e; font-weight: 700; }

      /* Halftime/Fulltime */
      .htft-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
      }
      .htft-item {
        background: #1e293b; border-radius: 6px; padding: 8px 6px;
        text-align: center;
      }
      .htft-item.best { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); }
      .htft-label { display: block; font-size: 10px; color: #94a3b8; margin-bottom: 2px; }
      .htft-prob { display: block; font-size: 14px; font-weight: 800; color: #f1f5f9; }
      .htft-item.best .htft-prob { color: #22c55e; }

      /* Odds Comparison */
      .odds-table { font-size: 11px; }
      .odds-header {
        display: grid; grid-template-columns: 1fr 50px 50px 50px; gap: 4px;
        padding: 6px 8px; background: #1e293b; border-radius: 6px 6px 0 0;
        font-weight: 700; color: #64748b; text-align: center;
      }
      .odds-header span:first-child { text-align: left; }
      .odds-row {
        display: grid; grid-template-columns: 1fr 50px 50px 50px; gap: 4px;
        padding: 6px 8px; border-bottom: 1px solid #1e293b; text-align: center;
      }
      .odds-row:last-child { border-bottom: none; }
      .odds-bk { text-align: left; color: #94a3b8; font-weight: 600; }
      .odds-val { color: #e2e8f0; font-weight: 600; }

      /* Player Impact */
      .player-team-title {
        font-size: 12px; font-weight: 700; color: #94a3b8;
        padding: 8px 0 6px; border-bottom: 1px solid #1e293b; margin-bottom: 6px;
      }
      .player-row {
        display: flex; gap: 10px; padding: 8px 0;
        border-bottom: 1px solid rgba(30,41,59,0.5);
      }
      .player-photo {
        width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
        background: #1e293b; flex-shrink: 0;
      }
      .player-photo-placeholder {
        width: 36px; height: 36px; border-radius: 50%; background: #334155;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 700; color: #64748b; flex-shrink: 0;
      }
      .player-info { flex: 1; min-width: 0; }
      .player-name { font-size: 12px; font-weight: 700; }
      .player-pos { font-size: 10px; color: #64748b; font-weight: 500; }
      .player-stats {
        display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; font-size: 10px; color: #94a3b8;
      }
      .prob-tag { color: #60a5fa; font-weight: 600; }
      .player-meta { display: flex; gap: 8px; margin-top: 3px; font-size: 10px; }
      .card-risk { font-weight: 600; }
      .card-low { color: #22c55e; }
      .card-medium { color: #f59e0b; }
      .card-high { color: #ef4444; }
      .impact-badge { font-weight: 700; }

      /* H2H */
      .h2h-stats { display: flex; gap: 8px; margin-bottom: 8px; }
      .h2h-stat {
        flex: 1; text-align: center; background: #1e293b; border-radius: 8px; padding: 10px 6px;
      }
      .h2h-val { font-size: 20px; font-weight: 800; color: #f1f5f9; }
      .h2h-lbl { font-size: 10px; color: #64748b; margin-top: 2px; }
      .h2h-extra {
        display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #94a3b8;
        padding: 6px 0;
      }

      /* Key Factors */
      .factors-list { padding-left: 18px; margin-bottom: 4px; }
      .factors-list li { font-size: 12px; color: #cbd5e1; margin-bottom: 6px; line-height: 1.4; }

      /* Risks */
      .risks { margin-bottom: 4px; }
      .risk-item {
        font-size: 11px; padding: 6px 10px; border-radius: 6px; margin-bottom: 4px;
        border-left: 3px solid;
      }
      .risk-info { background: rgba(59,130,246,0.08); border-color: #3b82f6; color: #93c5fd; }
      .risk-low { background: rgba(34,197,94,0.08); border-color: #22c55e; color: #86efac; }
      .risk-medium { background: rgba(245,158,11,0.08); border-color: #f59e0b; color: #fcd34d; }
      .risk-high { background: rgba(239,68,68,0.08); border-color: #ef4444; color: #fca5a5; }

      /* No Data Message */
      .no-data-msg { text-align: center; padding: 20px 12px; }
      .no-data-icon { font-size: 28px; margin-bottom: 10px; opacity: 0.5; }
      .no-data-title { font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
      .no-data-desc { font-size: 11px; color: #64748b; line-height: 1.5; }

      /* Data Sources */
      .ds-list { font-size: 11px; }
      .ds-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1e293b; }
      .ds-key { color: #64748b; text-transform: capitalize; }
      .ds-val { color: #94a3b8; }
      .ds-val.live { color: #22c55e; font-weight: 600; }

      .powered-by {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        font-size: 11px; color: #475569;
        padding: 16px 0 20px; border-top: 1px solid #1e293b; margin-top: 16px;
      }
      .powered-by-img { width: 16px; height: 16px; border-radius: 3px; object-fit: contain; }

      @media (max-width: 500px) {
        .spark-panel { width: 100vw; right: -100vw; }
      }
    `;
  }

  return { show, hide, updatePanelLiveScore };
})();
