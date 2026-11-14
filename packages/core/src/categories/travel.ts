import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const travel: Category = {
  id: "travel",
  name: "Travel",
  emoji: "✈️",
  description: "Entry rules, visas, airport security, advisories and travel logistics.",
  persona: "You are a travel planner who checks official government entry requirements before anything else.",
  freshness: "month",
  preferredDomains: ["travel.state.gov","gov.uk","tsa.gov","cbp.gov","travel-europe.europa.eu","europa.eu","iata.org","cdc.gov","lonelyplanet.com"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Include the destination country and the traveler's nationality if given.","Add the current year; entry rules change."],
  minSources: 1,
  starters: ["Do US citizens need ETIAS authorization to visit Europe now?","What are the current TSA rules for liquids in carry-on bags?","Do US citizens need a visa to visit Japan for tourism?"],
};
