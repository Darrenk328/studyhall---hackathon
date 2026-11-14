import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

/** The vendors' main domains (subdomains included): Autodesk, Dassault (SOLIDWORKS), Onshape, PTC, FreeCAD, MathWorks. */
const VENDOR_DOMAINS = ["autodesk.com", "solidworks.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"];

export const engineering: Category = {
  id: "engineering",
  name: "Engineering Software",
  emoji: "🛠️",
  icon: "wrench",
  description: "CAD, simulation and engineering computing: Fusion, Inventor, SolidWorks, Onshape, Creo, FreeCAD, MATLAB, Simulink.",
  persona: "You are a senior engineer fluent in CAD and MATLAB who teaches workflows precisely and writes correct, current code.",
  freshness: "month",
  // Rule: each vendor is listed by its main domain, and matching covers every subdomain, so a
  // vendor's help site, official blog and community forum count the same way. Forums are still
  // labelled forums and ranked lower (release.ts isForum), whatever the domain.
  preferredDomains: VENDOR_DOMAINS,
  authorityDomains: VENDOR_DOMAINS,
  // Unrelated "Fusion" products that showed up in a test search.
  blockedDomains: [...BASE_BLOCKED_DOMAINS, "doc.photonengine.com", "fusionsignage.com.au"],
  queryHints: [
    'Always write "Autodesk Fusion" and "Autodesk Inventor", never bare "Fusion" or "Inventor".',
    'For questions about recent changes, add "release notes" or "what\'s new" and the current year.',
    "For MATLAB and Simulink, include the release name (for example R2026b) when one is known.",
  ],
  minSources: 1,
  starters: [
    "What changed in the latest Autodesk Fusion update?",
    "How do I make a sheet metal flange in Inventor?",
    "What's new in the latest MATLAB release?",
  ],
  versionAware: true,
  apps: [
    {
      id: "fusion",
      label: "Fusion",
      name: "Autodesk Fusion",
      aliases: ["autodesk\\s+fusion", "fusion\\s*360"],
      weakAliases: ["\\bfusion\\b"],
      rewrite: "\\b(?:autodesk\\s+)?fusion(?:\\s*360)?\\b",
      // Other vendors' sites are excluded through `domains`, including mathworks.com/help/fusion
      // (MATLAB's sensor-fusion toolbox).
      domains: ["autodesk.com"],
    },
    { id: "inventor", label: "Inventor", name: "Autodesk Inventor", aliases: ["autodesk\\s+inventor"], weakAliases: ["\\binventor\\b"], rewrite: "\\b(?:autodesk\\s+)?inventor\\b", domains: ["autodesk.com"] },
    { id: "solidworks", label: "SolidWorks", name: "SOLIDWORKS", aliases: ["solid\\s?works"], domains: ["solidworks.com"] },
    { id: "onshape", label: "Onshape", name: "Onshape", aliases: ["\\bonshape\\b"], domains: ["onshape.com"] },
    { id: "creo", label: "Creo", name: "PTC Creo", aliases: ["\\bcreo\\b"], rewrite: "\\b(?:ptc\\s+)?creo\\b", domains: ["ptc.com"] },
    { id: "freecad", label: "FreeCAD", name: "FreeCAD", aliases: ["\\bfree\\s?cad\\b"], domains: ["freecad.org"] },
    // "Sensor fusion" means MATLAB's toolbox; Autodesk pages are excluded for MATLAB questions (via `domains`).
    { id: "matlab", label: "MATLAB", name: "MATLAB", aliases: ["\\bmatlab\\b", "sensor\\s+fusion", "\\bmathworks\\b"], domains: ["mathworks.com"] },
    { id: "simulink", label: "Simulink", name: "Simulink", aliases: ["\\bsimulink\\b"], domains: ["mathworks.com"] },
  ],
};
