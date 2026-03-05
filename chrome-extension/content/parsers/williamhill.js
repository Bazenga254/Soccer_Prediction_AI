/**
 * William Hill Parser (Europe)
 * URL: https://www.williamhill.com/
 * More traditional DOM structure with stable selectors.
 */
class WilliamHillParser extends SparkBaseParser {
  constructor() { super("William Hill", "williamhill"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="event-card"], [class*="sp-event"], [class*="btmarket__row"], ' +
      '[class*="event__row"], [data-event-id], [class*="match-container"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team-name"], [class*="participant"], [class*="competitor"], ' +
      '[class*="event-name"] span, [class*="selection-name"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50);
    if (teams.length < 2) return null;
    return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="competition"], [class*="category"]');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) {
    return el.querySelector('[class*="odds"], [class*="market"], [class*="price"]') || el;
  }
}
