import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const legal: Category = {
  id: "legal",
  name: "Legal",
  emoji: "⚖️",
  icon: "scale",
  description: "Laws, regulations, court decisions and legal deadlines.",
  persona: "You are a legal researcher who cites statutes, regulators and court records, and always names the jurisdiction.",
  freshness: "year",
  preferredDomains: ["law.cornell.edu","congress.gov","supremecourt.gov","uscourts.gov","federalregister.gov","dol.gov","ftc.gov","justia.com","gov.uk","eur-lex.europa.eu","europa.eu"],
  authorityDomains: ["congress.gov","supremecourt.gov","uscourts.gov","federalregister.gov","dol.gov","ftc.gov","gov.uk","eur-lex.europa.eu","europa.eu"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Include the jurisdiction (country or state).","Add the current year; laws and thresholds change."],
  safety: "Give general legal information only, not legal advice. Say which jurisdiction the sources cover and that rules differ elsewhere. Say that a person's specific situation needs a licensed lawyer.",
  professional: "a licensed lawyer in your jurisdiction",
  minSources: 2,
  starters: ["What is the current federal minimum wage in the United States?","What major cases is the US Supreme Court hearing this term?","When do the EU AI Act's rules for general-purpose AI models apply?"],
};
