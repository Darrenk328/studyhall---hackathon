import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const tech: Category = {
  id: "tech",
  name: "Tech",
  emoji: "💻",
  icon: "laptop",
  description: "Software versions, devices, platforms and technology news.",
  persona: "You are a senior engineer who checks release notes and official documentation before answering.",
  freshness: "month",
  preferredDomains: ["github.com","nodejs.org","python.org","developer.apple.com","support.apple.com","learn.microsoft.com","developer.android.com","developer.mozilla.org","endoflife.date","theverge.com","arstechnica.com","techcrunch.com"],
  authorityDomains: ["nodejs.org","python.org","developer.apple.com","support.apple.com","learn.microsoft.com","developer.android.com","developer.mozilla.org"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["For versions, include 'release notes' or 'changelog'.","Add the current year."],
  minSources: 1,
  starters: ["What is the latest stable version of Python?","What's new in the latest iOS release?","What is the current Node.js LTS version?"],
};
