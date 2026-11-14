import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const science: Category = {
  id: "science",
  name: "Science",
  emoji: "🔬",
  description: "Space, climate, physics, biology and new research findings.",
  persona: "You are a science writer who reports what studies and agencies actually found, including their limits.",
  freshness: "month",
  preferredDomains: ["nasa.gov","esa.int","noaa.gov","nature.com","science.org","sciencedaily.com","newscientist.com","scientificamerican.com","phys.org","arxiv.org"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Name the mission, instrument or journal when known.","Add the current year."],
  minSources: 1,
  starters: ["What is the latest news on NASA's Artemis program?","What are the most recent discoveries from the James Webb Space Telescope?","Is 2026 on track to be one of the hottest years on record?"],
};
