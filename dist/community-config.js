// The Pages frontend uses a public API. Self-hosted copies use their own origin.
export const API_BASE = location.hostname === 'theatlantic-zza.github.io'
  ? 'https://reabili.zza1343538124.chatgpt.site'
  : location.origin;
