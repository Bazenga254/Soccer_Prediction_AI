/**
 * FanDuel Parser (USA)
 * URL: https://www.fanduel.com/
 * Similar to DraftKings in structure.
 */
class FanDuelParser extends SparkBaseParser {
  constructor() { super("FanDuel", "fanduel"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="event-card"], [data-testid*="event"], [class*="event-row"], ' +
      '[class*="fixture-row"], [class*="market-row"], li[class*="event"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team-name"], [class*="participant"], [class*="event-name"] span, ' +
      '[class*="competitor-name"], a[class*="team"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50 && !t.match(/^[+-]?\d/));
    if (teams.length >= 2) {
      return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
    }
    return null;
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="competition"], [class*="category"]');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) { return el; }
}
