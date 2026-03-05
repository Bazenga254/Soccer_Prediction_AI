/**
 * Spark AI - Base Parser
 * Abstract base class for betting site match detection and button injection.
 * Each site-specific parser extends this class.
 */

class SparkBaseParser {
  constructor(siteName, siteKey) {
    this.siteName = siteName;
    this.siteKey = siteKey;
    this.observer = null;
    this.processedElements = new WeakSet();
    this.scanDebounce = null;
  }

  /** Override: Return NodeList/Array of match container elements */
  getMatchElements() { return []; }

  /** Override: Extract {homeTeam, awayTeam, competition} from a match element */
  extractMatchInfo(element) { return null; }

  /** Override: Return the DOM node to append the button to */
  getButtonAnchor(matchElement) { return matchElement; }

  /** Start observing DOM for dynamically loaded match elements */
  startObserving() {
    this.observer = new MutationObserver(() => {
      if (this.scanDebounce) clearTimeout(this.scanDebounce);
      this.scanDebounce = setTimeout(() => this.scanAndInject(), 500);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Scan page for match elements and inject Analyze buttons */
  scanAndInject() {
    const elements = this.getMatchElements();
    let injected = 0;

    for (const el of elements) {
      if (this.processedElements.has(el)) continue;

      const info = this.extractMatchInfo(el);
      if (info && info.homeTeam && info.awayTeam) {
        this.injectButton(el, info);
        this.processedElements.add(el);
        injected++;
      }
    }

    if (injected > 0) {
      console.log(`[Spark AI] Injected ${injected} buttons on ${this.siteName}`);
    }
  }

  /** Inject the "Analyze" button near a match element */
  injectButton(matchElement, matchInfo) {
    const anchor = this.getButtonAnchor(matchElement);
    if (!anchor || anchor.querySelector(".spark-ai-btn")) return;

    const btn = document.createElement("button");
    btn.className = "spark-ai-btn";
    btn.innerHTML = '<span class="spark-ai-bolt">&#9889;</span> Analyze';
    btn.title = "Analyze with Spark AI";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAnalyzeClick(matchInfo, btn);
    });

    anchor.style.position = "relative";
    anchor.appendChild(btn);
  }

  /** Handle Analyze button click */
  async onAnalyzeClick(matchInfo, buttonEl) {
    // Update button state
    buttonEl.disabled = true;
    buttonEl.classList.add("spark-ai-btn-loading");
    buttonEl.innerHTML = '<span class="spark-ai-spinner"></span> Analyzing...';

    try {
      // Step 1: Resolve team names to API-Football IDs
      const lookupResult = await chrome.runtime.sendMessage({
        type: "LOOKUP_TEAMS",
        teams: [
          { name: matchInfo.homeTeam, position: "home" },
          { name: matchInfo.awayTeam, position: "away" },
        ],
        competition: matchInfo.competition || "",
      });

      if (lookupResult.error) {
        this.showButtonError(buttonEl, lookupResult.error);
        return;
      }

      const matches = lookupResult.matches || [];
      if (matches.length < 2 || !matches[0]?.id || !matches[1]?.id) {
        this.showButtonError(buttonEl, "Could not identify teams");
        return;
      }

      // Step 2: Get prediction
      const prediction = await chrome.runtime.sendMessage({
        type: "PREDICT",
        data: {
          team_a_id: matches[0].id,
          team_b_id: matches[1].id,
          venue: "team_a",
          competition: matchInfo.competition || "PL",
          team_a_name: matches[0].name,
          team_b_name: matches[1].name,
        },
      });

      if (prediction.error) {
        this.showButtonError(buttonEl, prediction.error);
        return;
      }

      // Step 3: Show analysis panel
      if (typeof SparkAnalysisPanel !== "undefined") {
        SparkAnalysisPanel.show(prediction, matchInfo);
      }

      // Reset button
      this.resetButton(buttonEl);
    } catch (err) {
      this.showButtonError(buttonEl, "Something went wrong");
    }
  }

  showButtonError(btn, msg) {
    btn.classList.remove("spark-ai-btn-loading");
    btn.classList.add("spark-ai-btn-error");
    btn.innerHTML = `<span class="spark-ai-bolt">&#9888;</span> ${msg}`;
    btn.disabled = false;

    setTimeout(() => this.resetButton(btn), 3000);
  }

  resetButton(btn) {
    btn.classList.remove("spark-ai-btn-loading", "spark-ai-btn-error");
    btn.innerHTML = '<span class="spark-ai-bolt">&#9889;</span> Analyze';
    btn.disabled = false;
  }

  /** Stop observing */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
