export interface SchemaCapabilities {
  booksExclude: boolean;
  decksExclude: boolean;
  cardsUpdatedAt: boolean;
  cardsHasMistake: boolean;
  userDailyStats: boolean;
  userMistakes: boolean;
}

const DEFAULT_CAPABILITIES: SchemaCapabilities = {
  booksExclude: false,
  decksExclude: false,
  cardsUpdatedAt: false,
  cardsHasMistake: false,
  userDailyStats: false,
  userMistakes: false,
};

let cachedCapabilities: SchemaCapabilities | null = null;
let inFlightCheck: Promise<SchemaCapabilities> | null = null;
let lastCheckedAt = 0;
const RECHECK_MS = 5 * 60 * 1000;

export async function getSchemaCapabilities(): Promise<SchemaCapabilities> {
  if (typeof window === 'undefined') {
    return cachedCapabilities || DEFAULT_CAPABILITIES;
  }
  const now = Date.now();
  if (cachedCapabilities && now - lastCheckedAt < RECHECK_MS) {
    return cachedCapabilities;
  }
  if (inFlightCheck) {
    return inFlightCheck;
  }

  inFlightCheck = (async () => {
    try {
      const res = await fetch('/api/sync?schema=1', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.schema && typeof json.schema === 'object') {
          cachedCapabilities = {
            ...DEFAULT_CAPABILITIES,
            ...json.schema,
          };
          lastCheckedAt = Date.now();
          return cachedCapabilities!;
        }
      }
    } catch {}
    return cachedCapabilities || DEFAULT_CAPABILITIES;
  })().finally(() => {
    inFlightCheck = null;
  });

  return inFlightCheck;
}

export function getCachedSchemaCapabilities(): SchemaCapabilities {
  return cachedCapabilities || DEFAULT_CAPABILITIES;
}

export function markSchemaCapabilityFalse(key: keyof SchemaCapabilities): void {
  if (!cachedCapabilities) {
    cachedCapabilities = { ...DEFAULT_CAPABILITIES, [key]: false };
  } else {
    cachedCapabilities = { ...cachedCapabilities, [key]: false };
  }
}
