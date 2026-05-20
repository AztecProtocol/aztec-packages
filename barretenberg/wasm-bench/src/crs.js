const DEFAULT_SRS_SIZE = 2 ** 19;
const DEFAULT_GRUMPKIN_SRS_SIZE = 2 ** 16;

async function fetchBytes(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function withBaseUrl(baseUrl, path) {
  return baseUrl ? new URL(path, baseUrl).toString() : path;
}

export async function fetchCrs({ srsSize = DEFAULT_SRS_SIZE, grumpkinSrsSize = DEFAULT_GRUMPKIN_SRS_SIZE, crsBaseUrl } = {}) {
  const [g1, g2, grumpkin] = await Promise.all([
    fetchBytes(withBaseUrl(crsBaseUrl, `/crs/bn254-g1?points=${srsSize}`)),
    fetchBytes(withBaseUrl(crsBaseUrl, '/crs/bn254-g2')),
    fetchBytes(withBaseUrl(crsBaseUrl, `/crs/grumpkin-g1?points=${grumpkinSrsSize}`)),
  ]);
  return {
    srsSize,
    grumpkinSrsSize,
    g1,
    g2,
    grumpkin,
  };
}
