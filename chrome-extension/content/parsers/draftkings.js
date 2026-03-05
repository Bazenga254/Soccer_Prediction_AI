/**
 * DraftKings Parser (USA)
 * URL: https://www.draftkings.com/
 * Uses data-testid attributes extensively - stable selectors.
 */
class DraftKingsParser extends SparkBaseParser {
  constructor() { super("DraftKings", "draftkings"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[data-testid*="event-cell"], [data-testid*="event-row"], ' +
      '[class*="event-cell"], [class*="sportsbook-event"], ' +
      'div[class*="parlay-card-"], table[class*="sportsbook"] tbody tr'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="event-cell__name"], [class*="team-name"], [data-testid*="participant"], ' +
      '[class*="sportsbook-outcome-cell__label"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50 && !t.match(/^[+-]?\d/));
    if (teams.length >= 2) {
      return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
    }
    return null;
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="category"], [class*="subcategory"]');
    return header?.querySelector('[class*="label"], [class*="name"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) { return el; }
}
