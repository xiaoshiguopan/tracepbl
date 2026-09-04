import { describe, expect, it } from "vitest";
import { canonicalHash } from "../src/index.js";

describe("repository command hashing", () => {
  it("is stable across object key order", () => expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 })));
  it("changes when normalized business input changes", () => expect(canonicalHash({ title: "甲" })).not.toBe(canonicalHash({ title: "乙" })));
});
