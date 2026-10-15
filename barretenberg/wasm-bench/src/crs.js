const DEFAULT_SRS_SIZE = 2 ** 19;
const DEFAULT_GRUMPKIN_SRS_SIZE = 2 ** 16;

async function fetchBytes(url, progress, label, { retries = 4, retryDelayMs = 500 } = {}) {
  const started = performance.now();
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      progress?.(label, { url, bytes: bytes.byteLength, elapsedMs: performance.now() - started, attempt });
      return bytes;
    } catch (error) {
      lastError = error;
      progress?.(`${label}_retry`, { url, attempt, message: error?.message ?? String(error) });
      if (attempt >= retries) break;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts: ${lastError?.message ?? lastError}`);
}

function withBaseUrl(baseUrl, path) {
  return baseUrl ? new URL(path, baseUrl).toString() : path;
}

export async function fetchCrs({ srsSize = DEFAULT_SRS_SIZE, grumpkinSrsSize = DEFAULT_GRUMPKIN_SRS_SIZE, crsBaseUrl, progress } = {}) {
  const [g1, g2, grumpkin] = await Promise.all([
    fetchBytes(withBaseUrl(crsBaseUrl, `/crs/bn254-g1?points=${srsSize}`), progress, 'crs_g1_fetched'),
    fetchBytes(withBaseUrl(crsBaseUrl, '/crs/bn254-g2'), progress, 'crs_g2_fetched'),
    fetchBytes(withBaseUrl(crsBaseUrl, `/crs/grumpkin-g1?points=${grumpkinSrsSize}`), progress, 'crs_grumpkin_fetched'),
  ]);
  return {
    srsSize,
    grumpkinSrsSize,
    g1,
    g2,
    grumpkin,
  };
}
