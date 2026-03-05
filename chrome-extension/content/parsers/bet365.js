/**
 * Bet365 Parser (Europe)
 * URL: https://www.bet365.com/
 * HARDEST parser: obfuscated class names that change per deploy.
 * Strategy: Use structural selectors, ARIA labels, and data attributes.
 */
class Bet365Parser extends SparkBaseParser {
  constructor() { super("Bet365", "bet365"); }

  getMatchElements() {
    // Bet365 uses random class names. Try multiple strategies:
    const selectors = [
      '[class*="Participant"], [class*="participant"]',
      '[role="row"]',
      '[data-fixtureid]',
      'div[class*="event"]',
      'div[class*="fixture"]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return els;
    }
    // Fallback: look for containers with exactly 2 team-like text elements
    return document.querySelectorAll('[class*="gl-Market"], [class*="rcl-"]');
  }

  extractMatchInfo(element) {
    // Try aria-label first (most reliable on Bet365)
    const ariaLabel = element.getAttribute("aria-label") || "";
    const ariaMatch = ariaLabel.match(/(.+?)\s+v\s+(.+)/i);
    if (ariaMatch) {
      return { homeTeam: ariaMatch[1].trim(), awayTeam: ariaMatch[2].trim(), competition: "", element };
    }

    // Try finding team name elements
    const teamEls = element.querySelectorAll(
      '[class*="Team"], [class*="team"], [class*="Name"], [class*="participant"]'
    );
    const teams = [...teamEls]
      .map(el => el.textContent.trim())
      .filter(t => t.length > 1 && t.length < 50 && !t.match(/^\d/));

    if (teams.length >= 2) {
      return { homeTeam: teams[0], awayTeam: teams[1], competition: "", element };
    }

    return null;
  }

  getButtonAnchor(el) { return el; }
}
