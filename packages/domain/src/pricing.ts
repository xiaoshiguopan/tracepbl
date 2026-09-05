export type PriceProfile = Readonly<{ mode: "fake" | "real"; version: string; currency: "CNY"; generationInput: number; generationOutput: number; embedding: number }>;
export const fakePriceProfile = (version = "synthetic-zero-cost.v1"): PriceProfile => ({ mode: "fake", version, currency: "CNY", generationInput: 0, generationOutput: 0, embedding: 0 });
export function realPriceProfile(env: NodeJS.ProcessEnv): PriceProfile {
  const profile: PriceProfile = { mode: "real", version: env.TRACEPBL_PRICE_PROFILE_VERSION ?? "", currency: "CNY", generationInput: Number(env.TRACEPBL_GENERATION_INPUT_CNY_PER_MILLION), generationOutput: Number(env.TRACEPBL_GENERATION_OUTPUT_CNY_PER_MILLION), embedding: Number(env.TRACEPBL_EMBEDDING_CNY_PER_MILLION) };
  if (!profile.version || profile.version.length > 100 || [profile.generationInput, profile.generationOutput, profile.embedding].some(rate => !Number.isFinite(rate) || rate <= 0 || rate > 100000 || rate !== Math.round(rate * 1_000_000) / 1_000_000)) throw new Error("Real provider requires a price profile and positive CNY token rates for generation and embedding (at most six decimal places)");
  return profile;
}
export function generationReservation(profile: PriceProfile) { return generationCost(profile, 48000, 8000); }
export function generationCost(profile: PriceProfile, input: number, output: number) {
  const amount = BigInt(input) * BigInt(Math.round(profile.generationInput * 1_000_000)) + BigInt(output) * BigInt(Math.round(profile.generationOutput * 1_000_000));
  return Number((amount + 999_999n) / 1_000_000n);
}
