import { describe, expect, it } from "vitest";
import { isBlockedAddress, validatePublicUrl } from "../src/url-fetch.js";

describe("URL fetch boundary", () => {
  it.each(["::ffff:7f00:1", "::ffff:a00:1", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:7f00:1"])("blocks hexadecimal mapped private IPv4 %s", (address) => expect(isBlockedAddress(address)).toBe(true));
  it("continues to allow public mapped IPv4 and rejects private DNS answers", async () => {
    expect(isBlockedAddress("::ffff:5db8:d822")).toBe(false);
    await expect(validatePublicUrl("https://example.invalid", async () => [{ address: "::ffff:7f00:1", family: 6 }])).rejects.toMatchObject({ code: "URL_BLOCKED" });
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])("blocks non-public address %s", (address) => expect(isBlockedAddress(address)).toBe(true));
  it("rejects numeric localhost, userinfo, and nonstandard ports", async () => {
    await expect(validatePublicUrl("http://2130706433", async () => [{ address: "127.0.0.1", family: 4 }])).rejects.toMatchObject({ code: "URL_BLOCKED" });
    await expect(validatePublicUrl("https://user:pass@example.com", async () => [{ address: "93.184.216.34", family: 4 }])).rejects.toMatchObject({ code: "URL_INVALID" });
    await expect(validatePublicUrl("https://example.com:8443", async () => [{ address: "93.184.216.34", family: 4 }])).rejects.toMatchObject({ code: "URL_BLOCKED" });
  });
  it("accepts only when every resolved address is public", async () => {
    await expect(validatePublicUrl("https://example.com", async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }])).rejects.toMatchObject({ code: "URL_BLOCKED" });
    await expect(validatePublicUrl("https://example.com", async () => [{ address: "93.184.216.34", family: 4 }])).resolves.toMatchObject({ url: expect.any(URL) });
  });
});
