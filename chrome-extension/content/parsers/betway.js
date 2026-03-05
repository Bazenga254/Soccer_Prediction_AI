/**
 * Betway Parser (Europe / Kenya)
 * URL: https://www.betway.com/ or https://www.betway.co.ke/
 * Angular/React SPA with virtual scrolling.
 */
class BetwayParser extends SparkBaseParser {
  constructor() { super("Betway", "betway"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="event-row"], [class*="eventRow"], [class*="event-card"], ' +
      '[class*="match-row"], [data-testid*="event"], [class*="rj-ev-list__ev-card"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team"], [class*="competitor"], [class*="participant"], ' +
      '[class*="teamName"], [class*="event-name"] span'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50);
    if (teams.length < 2) return null;
    return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="competition"]');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) {
    return el.querySelector('[class*="odds"], [class*="market"]') || el;
  }
}
