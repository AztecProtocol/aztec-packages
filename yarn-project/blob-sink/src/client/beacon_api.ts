import type { BlobSinkConfig } from './config.js';

export function getBeaconNodeFetchOptions(
  _baseUrl: string | URL,
  api: string,
  config: BlobSinkConfig,
  l1ConsensusHostIndex?: number,
): {
  url: URL;
  headers?: Record<string, string>;
} {
  const { l1ConsensusHostApiKeys, l1ConsensusHostApiKeyHeaders } = config;
  const l1ConsensusHostApiKey =
    l1ConsensusHostIndex !== undefined && l1ConsensusHostApiKeys && l1ConsensusHostApiKeys[l1ConsensusHostIndex];
  const l1ConsensusHostApiKeyHeader =
    l1ConsensusHostIndex !== undefined &&
    l1ConsensusHostApiKeyHeaders &&
    l1ConsensusHostApiKeyHeaders[l1ConsensusHostIndex];

  const baseUrl = typeof _baseUrl === 'string' ? new URL(_baseUrl) : _baseUrl;
  const url = new URL(api, baseUrl);

  if (baseUrl.searchParams.size > 0) {
    for (const [key, value] of baseUrl.searchParams.entries()) {
      url.searchParams.append(key, value);
    }
  }

  if (l1ConsensusHostApiKey && !l1ConsensusHostApiKeyHeader) {
    url.searchParams.set('key', l1ConsensusHostApiKey.getValue());
  }

  return {
    url,
    ...(l1ConsensusHostApiKey &&
      l1ConsensusHostApiKeyHeader && {
        headers: {
          [l1ConsensusHostApiKeyHeader]: l1ConsensusHostApiKey.getValue(),
        },
      }),
  };
}
