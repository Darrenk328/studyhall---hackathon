import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const finance: Category = {
  id: "finance",
  name: "Finance",
  emoji: "💰",
  description: "Interest rates, inflation, taxes, retirement rules and personal-finance facts.",
  persona: "You are a personal-finance explainer who cites regulators, central banks and official statistics.",
  freshness: "month",
  preferredDomains: ["federalreserve.gov","sec.gov","irs.gov","treasury.gov","bls.gov","fred.stlouisfed.org","consumerfinance.gov","investopedia.com","reuters.com"],
  authorityDomains: ["federalreserve.gov","sec.gov","irs.gov","treasury.gov","bls.gov","fred.stlouisfed.org","consumerfinance.gov"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Add the current year (tax limits change every year).","Prefer the official source (Federal Reserve, IRS, BLS)."],
  safety: "Give general information only, not personalized investment, tax or financial advice. Do not tell the person to buy, sell or hold anything. Say that decisions about their own money are worth discussing with a qualified professional.",
  professional: "a licensed financial adviser or tax professional",
  minSources: 2,
  starters: ["What is the current federal funds rate target range?","What are the IRS 401(k) contribution limits for 2027?","What is the latest US inflation rate (CPI)?"],
};
