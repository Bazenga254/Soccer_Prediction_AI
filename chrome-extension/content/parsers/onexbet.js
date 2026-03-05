/**
 * 1xBet Parser
 * URL: https://www.1xbet.com/ or https://www.1xbet.co.ke/
 * Heavy DOM with many sports mixed. Look for soccer/football sections.
 */
class OneXBetParser extends SparkBaseParser {
  constructor() { super("1xBet", "onexbet"); }

  getMatchElements() {
    return document.querySelectorAll(
      '.c-events__item, .c-events-scoreboard__item, [class*="game-item"], ' +
      '[class*="event-row"], [class*="dashboard-game"], [class*="bets__row"], ' +
      'div[class*="game_wr"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team-name"], [class*="c-events__team"], [class*="team__name"], ' +
      '[class*="participant"], span[class*="team"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50);
    if (teams.length < 2) return null;
    return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
  }

  _getCompetition(el) {
    const header = el.closest('[class*="liga"], [class*="championship"], [class*="league"]');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) { return el; }
}
