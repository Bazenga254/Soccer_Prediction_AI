/**
 * Betika Parser (Kenya)
 * URL: https://www.betika.com/
 * React SPA with dynamic class names. Match cards in scrollable lists.
 */
class BetikaParser extends SparkBaseParser {
  constructor() { super("Betika", "betika"); }

  getMatchElements() {
    return document.querySelectorAll(
      '[class*="prebet-match"], [class*="match-card"], [class*="event-row"], ' +
      '[data-testid*="match"], [data-testid*="event"], ' +
      'div[class*="game-card"], div[class*="fixture"]'
    );
  }

  extractMatchInfo(element) {
    const teamEls = element.querySelectorAll(
      '[class*="team-name"], [class*="competitor"], [class*="participant"], ' +
      '[class*="home-team"], [class*="away-team"], [class*="team"] > span'
    );
    const teams = [...teamEls].map(el => el.textContent.trim()).filter(t => t.length > 1 && t.length < 50);
    if (teams.length < 2) {
      // Fallback: look for two main text nodes
      const allText = element.textContent.trim();
      const vsMatch = allText.match(/^(.{2,30})\s+(?:vs?\.?\s+|[-\u2013])\s*(.{2,30})$/im);
      if (vsMatch) return { homeTeam: vsMatch[1].trim(), awayTeam: vsMatch[2].trim(), competition: this._getCompetition(element), element };
      return null;
    }
    return { homeTeam: teams[0], awayTeam: teams[1], competition: this._getCompetition(element), element };
  }

  _getCompetition(el) {
    const header = el.closest('[class*="league"], [class*="category"], [class*="competition"]');
    const nameEl = header?.querySelector('[class*="name"], [class*="title"], span');
    return nameEl?.textContent?.trim() || "";
  }

  getButtonAnchor(el) {
    return el.querySelector('[class*="odds"], [class*="market"]') || el;
  }
}
