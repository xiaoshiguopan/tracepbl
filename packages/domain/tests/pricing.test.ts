import { describe, expect, it } from "vitest";
import { fakePriceProfile, generationCost, generationReservation, realPriceProfile } from "../src/pricing.ts";

describe("frozen price calculations", () => {
  it("keeps fake generation free", () => expect(generationReservation(fakePriceProfile())).toBe(0));
  it("requires embedding pricing before real execution", () => expect(() => realPriceProfile({ TRACEPBL_PRICE_PROFILE_VERSION: "synthetic", TRACEPBL_GENERATION_INPUT_CNY_PER_MILLION: "1", TRACEPBL_GENERATION_OUTPUT_CNY_PER_MILLION: "1" })).toThrow(/embedding/));
  it("rounds once in integer arithmetic, matching PostgreSQL numeric", () => {
    const profile = realPriceProfile({ TRACEPBL_PRICE_PROFILE_VERSION: "synthetic", TRACEPBL_GENERATION_INPUT_CNY_PER_MILLION: "0.14", TRACEPBL_GENERATION_OUTPUT_CNY_PER_MILLION: "0.1", TRACEPBL_EMBEDDING_CNY_PER_MILLION: "0.01" });
    expect(generationCost(profile, 100, 10)).toBe(15);
    expect(generationReservation(profile)).toBe(7520);
  });
});
