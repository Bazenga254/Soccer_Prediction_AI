/**
 * SportPesa Parser (Kenya)
 * URL: https://www.sportpesa.com/
 */
class SportPesaParser extends SparkBaseParser {
  constructor() { super("SportPesa", "sportpesa"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="event-row"], [class*="match-row"], [class*="fixture-row"], ' +
      '[class*="game-row"], tr[class*="event"], div[class*="event-card"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team"], [class*="competitor"], [class*="participant"], ' +
      '[class*="home"] span, [class*="away"] span, td[class*="name"]'
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
