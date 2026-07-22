import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { getPackageInfo } from '@aztec/pxe/config';
import { type NodeInfo, NodeInfoSchema } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

// Bump when the shape of a cached entry changes, so old entries are treated as a miss rather than mis-parsed.
const NODE_INFO_CACHE_FORMAT = 1;

const SINGLETON_NAME = 'node_info';

/**
 * Compound key that invalidates a persisted entry when it can no longer be trusted. `getPackageInfo().version` is
 * the monorepo release version shared by aztec.js / PXE / the wallet SDK, so an SDK upgrade forces a fresh fetch;
 * `NODE_INFO_CACHE_FORMAT` guards the cache's own on-disk shape.
 */
function versionKey(): string {
  return `${getPackageInfo().version}#${NODE_INFO_CACHE_FORMAT}`;
}

/**
 * Resolves node info, reusing a persisted copy when the node URL and SDK version match so that repeat wallet opens
 * (e.g. browser reloads) skip the `getNodeInfo` round-trip. Node info is immutable for a rollup, and the entry is
 * keyed by URL + SDK-release version, so a node redeployed to a different rollup or an SDK upgrade forces a fresh
 * fetch. Falls back to a live fetch with no caching when no URL or cache store is available (e.g. a pre-built
 * `AztecNode` was passed to the wallet instead of a URL).
 *
 * Reads and writes are best-effort: any cache failure degrades to a live fetch, so persistence can never break
 * wallet startup. Takes ownership of `cacheStore` and closes it before returning, since it is only needed for this
 * one lookup.
 */
export async function resolveNodeInfo(
  aztecNode: AztecNode,
  url: string | undefined,
  cacheStore: AztecAsyncKVStore | undefined,
  log: Logger,
): Promise<NodeInfo> {
  try {
    const key = versionKey();
    const singleton = url ? cacheStore?.openSingleton<string>(SINGLETON_NAME) : undefined;

    if (singleton) {
      try {
        const raw = await singleton.getAsync();
        if (raw) {
          const parsed: { url?: unknown; versionKey?: unknown; nodeInfo?: unknown } = JSON.parse(raw);
          if (parsed.url === url && parsed.versionKey === key) {
            log.debug('Reusing persisted node info', { url });
            return NodeInfoSchema.parse(parsed.nodeInfo);
          }
        }
      } catch (err) {
        log.debug('Ignoring unusable persisted node info', { err });
      }
    }

    const nodeInfo = await aztecNode.getNodeInfo();

    if (singleton) {
      try {
        await singleton.set(jsonStringify({ url, versionKey: key, nodeInfo }));
      } catch (err) {
        log.debug('Failed to persist node info', { err });
      }
    }

    return nodeInfo;
  } finally {
    await cacheStore?.close().catch(err => log.debug('Failed to close node info cache store', { err }));
  }
}
