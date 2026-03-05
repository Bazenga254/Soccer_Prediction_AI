/**
 * BetMGM Parser (USA)
 * URL: https://www.betmgm.com/
 * Angular-based with custom elements.
 */
class BetMGMParser extends SparkBaseParser {
  constructor() { super("BetMGM", "betmgm"); }

  getMatchElements() {
    return document.querySelectorAll(
      'ms-event, [class*="event-row"], [class*="participant-pair"], ' +
      'sp-coupon, [class*="grid-event"], [class*="event-card"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="participant"], [class*="team-name"], [class*="competitor"], ' +
      'ms-event-participant, [class*="option-name"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50 && !t.match(/^[+-]?\d/));
    if (teams.length >= 2) {
      return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
    }
    return null;
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="competition"], ms-league-header');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) { return el; }
}
