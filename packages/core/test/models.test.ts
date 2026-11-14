import { describe, expect, it } from "vitest";
import { MODELS } from "../src/index.js";

describe("model config", () => {
  it("uses sonnet for answer/verify and haiku for cheap steps", () => {
    expect(MODELS.answer).toMatch(/sonnet/);
    expect(MODELS.verify).toMatch(/sonnet/);
    expect(MODELS.plan).toMatch(/haiku/);
    expect(MODELS.classify).toMatch(/haiku/);
  });
});
