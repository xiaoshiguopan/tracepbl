// Build-time choice. A Pages build never probes localhost or falls back to an API.
export const isLocalMode = import.meta.env.MODE === "complete";
