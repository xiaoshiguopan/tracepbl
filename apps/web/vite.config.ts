import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const target = process.env.TRACEPBL_API_PROXY_TARGET ?? "http://127.0.0.1:8787";
  if (mode === "complete" && !["http://127.0.0.1:8787", "http://localhost:8787", "http://api:8787"].includes(target)) throw new Error("Complete mode requires the local API or Compose api service.");
  return ({
  base: mode === "complete" ? "/" : "/tracepbl/",
  server: {
    host: "127.0.0.1", port: 5173, strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem,key}", "**/.git/**", "**/.tracepbl/**", "**/output/**"] },
    ...(mode === "complete" ? { proxy: { "/api": { target, headers: { host: "127.0.0.1:8787" }, configure: proxy => { proxy.on("proxyRes", (response, _request, client) => { client.once("close", () => response.destroy()); }); } } } } : {}),
  },
  build: {
    sourcemap: true,
  },
}); });
