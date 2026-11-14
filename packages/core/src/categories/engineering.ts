import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

const AUTODESK = ["autodesk.com"];

export const engineering: Category = {
  id: "engineering",
  name: "Engineering Software",
  emoji: "🛠️",
  icon: "wrench",
  description: "CAD, simulation and engineering computing: Fusion, Inventor, SolidWorks, Onshape, Creo, FreeCAD, MATLAB, Simulink.",
  persona: "You are a senior engineer fluent in CAD and MATLAB who teaches workflows precisely and writes correct, current code.",
  freshness: "month",
  preferredDomains: [
    "help.autodesk.com",
    "autodesk.com",
    "forums.autodesk.com",
    "help.solidworks.com",
    "onshape.com",
    "cad.onshape.com",
    "ptc.com",
    "support.ptc.com",
    "freecad.org",
    "wiki.freecad.org",
    "mathworks.com",
  ],
  authorityDomains: ["help.autodesk.com", "autodesk.com", "help.solidworks.com", "onshape.com", "ptc.com", "freecad.org", "mathworks.com"],
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
      // mathworks.com/help/fusion is MATLAB's sensor-fusion toolbox.
      excludeDomains: ["mathworks.com"],
    },
    { id: "inventor", label: "Inventor", name: "Autodesk Inventor", aliases: ["autodesk\\s+inventor"], weakAliases: ["\\binventor\\b"], rewrite: "\\b(?:autodesk\\s+)?inventor\\b" },
    { id: "solidworks", label: "SolidWorks", name: "SOLIDWORKS", aliases: ["solid\\s?works"] },
    { id: "onshape", label: "Onshape", name: "Onshape", aliases: ["\\bonshape\\b"] },
    { id: "creo", label: "Creo", name: "PTC Creo", aliases: ["\\bcreo\\b"], rewrite: "\\b(?:ptc\\s+)?creo\\b" },
    { id: "freecad", label: "FreeCAD", name: "FreeCAD", aliases: ["\\bfree\\s?cad\\b"] },
    // "Sensor fusion" means MATLAB's toolbox; Autodesk pages are excluded for MATLAB questions.
    { id: "matlab", label: "MATLAB", name: "MATLAB", aliases: ["\\bmatlab\\b", "sensor\\s+fusion", "\\bmathworks\\b"], excludeDomains: AUTODESK },
    { id: "simulink", label: "Simulink", name: "Simulink", aliases: ["\\bsimulink\\b"], excludeDomains: AUTODESK },
  ],
};
