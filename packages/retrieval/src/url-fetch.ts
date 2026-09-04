import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export class UrlFetchError extends Error { constructor(public readonly code: "URL_INVALID" | "URL_BLOCKED" | "URL_FETCH_FAILED" | "INPUT_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE", message: string) { super(message); } }
export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;
const defaultResolver: Resolver = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((item) => ({ address: item.address, family: item.family as 4 | 6 }));

function blockedIpv4(address: string) {
  const octets = address.split(".").map(Number); const [a = 0, b = 0] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}
export function isBlockedAddress(input: string) {
  const address = input.toLowerCase().split("%")[0]!;
  if (isIP(address) === 4) return blockedIpv4(address);
  if (isIP(address) !== 6) return true;
  if (address.startsWith("::ffff:")) return blockedIpv4(address.slice(7));
  return address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || /^fe[89ab]/.test(address) || address.startsWith("ff") || address.startsWith("2001:db8:");
}

export async function validatePublicUrl(input: string, resolver: Resolver = defaultResolver) {
  let url: URL; try { url = new URL(input); } catch { throw new UrlFetchError("URL_INVALID", "URL 格式无效。"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || input.length > 2048) throw new UrlFetchError("URL_INVALID", "只允许普通 HTTP/HTTPS URL。");
  const port = url.port || (url.protocol === "https:" ? "443" : "80"); if (!['80', '443'].includes(port)) throw new UrlFetchError("URL_BLOCKED", "只允许 80/443 端口。");
  if (url.hostname.toLowerCase() === "localhost") throw new UrlFetchError("URL_BLOCKED", "本地地址不可抓取。");
  const addresses = await resolver(url.hostname); if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address))) throw new UrlFetchError("URL_BLOCKED", "目标地址不可抓取。");
  return { url, addresses };
}

type FetchResult = { finalUrl: string; title: string | null; text: string; contentType: "text/html" | "text/plain" };
export async function fetchPublicText(input: string, signal?: AbortSignal, resolver: Resolver = defaultResolver): Promise<FetchResult> {
  let current = input;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const { url, addresses } = await validatePublicUrl(current, resolver); const chosen = addresses[0]!;
    const result = await requestOnce(url, chosen, signal);
    if (result.redirect) { if (redirects === 3) throw new UrlFetchError("URL_FETCH_FAILED", "重定向次数过多。"); current = new URL(result.redirect, url).toString(); continue; }
    const text = result.contentType === "text/html" ? visibleText(result.body) : result.body;
    return { finalUrl: url.toString(), title: result.contentType === "text/html" ? extractTitle(result.body) : null, text: Array.from(text).slice(0, 100_000).join(""), contentType: result.contentType };
  }
  throw new UrlFetchError("URL_FETCH_FAILED", "无法完成抓取。");
}

function requestOnce(url: URL, chosen: ResolvedAddress, outerSignal?: AbortSignal) {
  return new Promise<{ redirect?: string; body: string; contentType: "text/html" | "text/plain" }>((resolve, reject) => {
    const controller = new AbortController(); const totalTimer = setTimeout(() => controller.abort(new UrlFetchError("URL_FETCH_FAILED", "抓取超时。")), 20_000);
    const abort = () => controller.abort(outerSignal?.reason); if (outerSignal?.aborted) abort(); else outerSignal?.addEventListener("abort", abort, { once: true });
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requester({ protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: `${url.pathname}${url.search}`, method: "GET", headers: { Accept: "text/html,text/plain;q=0.9", "Accept-Encoding": "identity", "User-Agent": "TracePBL-Local/1.0" }, lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family), signal: controller.signal, servername: url.hostname }, (response) => {
      if (response.socket.remoteAddress && response.socket.remoteAddress !== chosen.address) { response.destroy(); reject(new UrlFetchError("URL_BLOCKED", "连接地址与已验证地址不一致。")); return; }
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) { response.resume(); resolve({ redirect: response.headers.location, body: "", contentType: "text/plain" }); return; }
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) { response.resume(); reject(new UrlFetchError("URL_FETCH_FAILED", "目标页面未成功响应。")); return; }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") { response.destroy(); reject(new UrlFetchError("UNSUPPORTED_MEDIA_TYPE", "不接受压缩响应。")); return; }
      const rawType = String(response.headers["content-type"] ?? "").split(";", 1)[0]!.trim().toLowerCase(); if (rawType !== "text/html" && rawType !== "text/plain") { response.destroy(); reject(new UrlFetchError("UNSUPPORTED_MEDIA_TYPE", "只接受 HTML 或纯文本。")); return; }
      const declared = Number(response.headers["content-length"] ?? 0); if (declared > 1_048_576) { response.destroy(); reject(new UrlFetchError("INPUT_TOO_LARGE", "页面响应超过 1 MiB。")); return; }
      const chunks: Buffer[] = []; let bytes = 0; response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1_048_576) response.destroy(new UrlFetchError("INPUT_TOO_LARGE", "页面响应超过 1 MiB。")); else chunks.push(chunk); });
      response.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), contentType: rawType })); response.on("error", reject);
    });
    request.setTimeout(10_000, () => request.destroy(new UrlFetchError("URL_FETCH_FAILED", "连接超时。")));
    request.on("error", reject); request.on("close", () => { clearTimeout(totalTimer); outerSignal?.removeEventListener("abort", abort); }); request.end();
  });
}
function decodeEntities(value: string) { return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code))); }
function visibleText(html: string) { return decodeEntities(html.replace(/<(script|style|noscript|template|form)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<!--([\s\S]*?)-->/g, " ").replace(/<[^>]+>/g, "\n")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
function extractTitle(html: string) { const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); return match ? decodeEntities(match[1]!).replace(/\s+/g, " ").trim().slice(0, 300) : null; }
