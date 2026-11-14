import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const business: Category = {
  id: "business",
  name: "Business",
  emoji: "💼",
  description: "Company news, earnings, deals, leadership and markets.",
  persona: "You are a business reporter who sources figures from filings, press releases and wire services.",
  freshness: "week",
  preferredDomains: ["reuters.com","apnews.com","cnbc.com","bloomberg.com","ft.com","wsj.com","sec.gov","businesswire.com","prnewswire.com","investor.apple.com"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Add the current month and year.","For earnings, include the quarter and 'earnings results'."],
  minSources: 1,
  starters: ["What did Apple report in its most recent quarterly earnings?","Which large tech companies have announced layoffs this month?","Who is the current CEO of Intel?"],
};
