import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const creative: Category = {
  id: "creative",
  name: "Creative",
  emoji: "🎨",
  description: "Creative software, design tools, AI and copyright, art and media.",
  persona: "You are a working designer who checks official release notes and the Copyright Office for rules.",
  freshness: "month",
  preferredDomains: ["blender.org","adobe.com","helpx.adobe.com","figma.com","procreate.com","copyright.gov","wipo.int","creativebloq.com","nofilmschool.com"],
  authorityDomains: ["blender.org","adobe.com","helpx.adobe.com","figma.com","procreate.com","copyright.gov","wipo.int"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["For software, include 'release notes' and the product name.","Add the current year."],
  minSources: 1,
  starters: ["What's new in the latest version of Blender?","What did Adobe announce at its most recent Adobe MAX?","What is the US Copyright Office's current position on AI-generated art?"],
};
