import { describe, expect, it } from "vitest";
import { plantEntityError, plantNegation, plantNumberError } from "../src/pipeline/planting.js";

describe("error planting (test tooling)", () => {
  it("number: changes exactly one number and keeps citations", () => {
    expect(plantNumberError("The target range is 3.75% to 4.00% [1].")).toBe("The target range is 5.25% to 4.00% [1].");
    expect(plantNumberError("Updated November 8, 2026 [5].")).toBe("Updated November 11, 2026 [5].");
    expect(plantNumberError("Met on October 28 [2][4].")).toBe("Met on October 21 [2][4].");
    expect(plantNumberError("No numbers [1].")).toBeUndefined();
  });

  it("negation: flips recommendation and requirement verbs", () => {
    expect(plantNegation("CDC recommends annual flu vaccination for everyone [4].")).toBe("CDC does not recommend annual flu vaccination for everyone [4].");
    expect(plantNegation("A 2026-2027 vaccine is recommended for all adults [1].")).toBe("A 2026-2027 vaccine is not recommended for all adults [1].");
    expect(plantNegation("US citizens are required to get ETIAS [2].")).toBe("US citizens are not required to get ETIAS [2].");
    expect(plantNegation("People who have COVID-19 should wait [5].")).toBe("People who have COVID-19 should not wait [5].");
    expect(plantNegation("The rate is 4% [1].")).toBeUndefined();
  });

  it("entity: swaps a known organization for a plausible wrong one", () => {
    expect(plantEntityError("The CDC recommends it [1].")).toBe("The WHO recommends it [1].");
    expect(plantEntityError("The Federal Reserve held rates [2].")).toBe("The European Central Bank held rates [2].");
    expect(plantEntityError("Moderna mNexspike needs 3 months [1].")).toBe("Novavax mNexspike needs 3 months [1].");
    expect(plantEntityError("Nothing known [1].")).toBeUndefined();
  });
});
