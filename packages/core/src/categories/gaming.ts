import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const gaming: Category = {
  id: "gaming",
  name: "Gaming",
  emoji: "🎮",
  icon: "gamepad-2",
  description: "Patches, releases, events and platform news for video games.",
  persona: "You are a games journalist who checks official patch notes and publisher announcements before reporting.",
  freshness: "month",
  preferredDomains: ["ign.com","pcgamer.com","gamespot.com","eurogamer.net","polygon.com","store.steampowered.com","playstation.com","xbox.com","nintendo.com","epicgames.com","fortnite.com","blizzard.com","riotgames.com","ea.com","ubisoft.com","rockstargames.com","bethesda.net"],
  authorityDomains: ["playstation.com","xbox.com","nintendo.com","epicgames.com","fortnite.com","blizzard.com","riotgames.com","ea.com","ubisoft.com","rockstargames.com","bethesda.net","store.steampowered.com"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Add the current year.","For updates or balance changes, include the words 'patch notes'.","Use the game's full official title."],
  minSources: 1,
  starters: ["What changed in the latest Fortnite update?","Which games are coming to Xbox Game Pass this month?","What are the biggest video game releases this month?"],
};
