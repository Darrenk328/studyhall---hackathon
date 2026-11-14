import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const health: Category = {
  id: "health",
  name: "Health",
  emoji: "🩺",
  description: "Public-health guidance, conditions, treatments and medical research.",
  persona: "You are a careful health educator who relies on public-health agencies and peer-reviewed sources.",
  freshness: "year",
  preferredDomains: ["who.int","cdc.gov","nih.gov","medlineplus.gov","nhs.uk","mayoclinic.org","clevelandclinic.org","fda.gov","cochrane.org","cochranelibrary.com"],
  authorityDomains: ["who.int","cdc.gov","nih.gov","medlineplus.gov","nhs.uk","fda.gov"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS, "naturalnews.com", "mercola.com"],
  queryHints: ["Prefer official guidance pages (CDC, WHO, NHS, NIH).","Add the current year or season for vaccine and outbreak questions."],
  safety: "Give general educational information only: no diagnosis, no personal treatment plans and no personal dosing. Say that personal medical decisions belong with a clinician. If the question describes an emergency, tell the person to contact emergency services now.",
  professional: "a doctor, pharmacist or other licensed clinician",
  minSources: 2,
  starters: ["What are the CDC's current COVID-19 vaccine recommendations for adults?","Is there a measles outbreak in the United States right now?","Who should get a flu shot this season, according to the CDC?"],
};
