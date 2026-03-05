/**
 * Mozzart Bet Parser (Kenya)
 * URL: https://www.mozzartbet.co.ke/
 * Simpler structure with league-grouped match listings.
 */
class MozzartBetParser extends SparkBaseParser {
  constructor() { super("Mozzart Bet", "mozzartbet"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="match-row"], [class*="event-row"], [class*="game-row"], ' +
      'tr[class*="match"], div[class*="fixture"], [class*="offer-row"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team"], [class*="competitor"], [class*="participant"], ' +
      '[class*="home-name"], [class*="away-name"], span[class*="name"]'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50);
    if (teams.length < 2) {
      const text = element.textContent;
      const match = text.match(/([A-Za-z\s.]+?)\s*[-\u2013vs]+\s*([A-Za-z\s.]+)/);
      if (match) return { homeTeam: match[1].trim(), awayTeam: match[2].trim(), competition: "", element };
      return null;
    }
    return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="sport-group"]');
    return header?.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || "";
  }

  getButtonAnchor(el) { return el; }
}
