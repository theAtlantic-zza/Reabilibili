// The Pages frontend uses a public API. Self-hosted copies use their own origin.
export const PRODUCTION_API = 'https://reabili-community.theatlantic-zza-reabili.workers.dev';
const page = globalThis.location;
export const API_BASE = !page || page.hostname === 'theatlantic-zza.github.io'
  ? PRODUCTION_API
  : page.origin;
