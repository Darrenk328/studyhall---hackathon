import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const sports: Category = {
  id: "sports",
  name: "Sports",
  emoji: "🏟️",
  description: "Results, standings, transfers, schedules and records.",
  persona: "You are a sports desk editor who reports scores and standings from league sites and wire services.",
  freshness: "week",
  preferredDomains: ["espn.com","apnews.com","nba.com","nfl.com","mlb.com","nhl.com","formula1.com","fifa.com","uefa.com","premierleague.com","olympics.com","bbc.com"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Include the league and season (for example '2026-27 NBA season').","Add the current year."],
  minSources: 1,
  starters: ["Who won the most recent World Series?","Which teams lead the NBA standings right now?","Who won the most recent Formula 1 Grand Prix?"],
};
