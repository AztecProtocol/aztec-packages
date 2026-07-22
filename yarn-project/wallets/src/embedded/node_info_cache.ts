import { BlockNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { getPackageInfo } from '@aztec/pxe/config';
import { BlockHash, GENESIS_BLOCK_HEADER_HASH } from '@aztec/stdlib/block';
import { type NodeInfo, NodeInfoSchema } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

// Bump when the shape of a cached entry changes, so old entries are treated as a miss rather than mis-parsed.
const NODE_INFO_CACHE_FORMAT = 2;

const SINGLETON_NAME = 'node_info';

/** Immutable per-rollup state fetched once at wallet startup and reused for the wallet's lifetime. */
export interface NodeStartupInfo {
  nodeInfo: NodeInfo;
  /** Genesis block hash, sourced from the node so the tip store agrees with the archiver on non-empty genesis. */
  initialBlockHash: BlockHash;
}

/**
 * Compound key that invalidates a persisted entry when it can no longer be trusted. `getPackageInfo().version` is
 * the monorepo release version shared by aztec.js / PXE / the wallet SDK, so an SDK upgrade forces a fresh fetch;
 * `NODE_INFO_CACHE_FORMAT` guards the cache's own on-disk shape.
 */
function versionKey(): string {
  return `${getPackageInfo().version}#${NODE_INFO_CACHE_FORMAT}`;
}

/**
 * Resolves the immutable node state a wallet needs at startup (node info + genesis block hash), reusing a persisted
 * copy when the node URL and SDK version match so that repeat wallet opens (e.g. browser reloads) skip the
 * `getNodeInfo` and genesis-block round-trips. Both values are immutable for a rollup, and the entry is keyed by
 * URL + SDK-release version, so a node redeployed to a different rollup or an SDK upgrade forces a fresh fetch.
 * Falls back to a live fetch with no caching when no URL or cache store is available (e.g. a pre-built `AztecNode`
 * was passed to the wallet instead of a URL).
 *
 * Reads and writes are best-effort: any cache failure degrades to a live fetch, so persistence can never break
 * wallet startup. Takes ownership of `cacheStore` and closes it before returning, since it is only needed for this
 * one lookup.
 */
export async function resolveStartupInfo(
  aztecNode: AztecNode,
  url: string | undefined,
  cacheStore: AztecAsyncKVStore | undefined,
  log: Logger,
): Promise<NodeStartupInfo> {
  try {
    const key = versionKey();
    const singleton = url ? cacheStore?.openSingleton<string>(SINGLETON_NAME) : undefined;

    if (singleton) {
      try {
        const raw = await singleton.getAsync();
        if (raw) {
          const parsed: { url?: unknown; versionKey?: unknown; nodeInfo?: unknown; initialBlockHash?: unknown } =
            JSON.parse(raw);
          if (parsed.url === url && parsed.versionKey === key && typeof parsed.initialBlockHash === 'string') {
            log.debug('Reusing persisted startup info', { url });
            return {
              nodeInfo: NodeInfoSchema.parse(parsed.nodeInfo),
              initialBlockHash: BlockHash.fromString(parsed.initialBlockHash),
            };
          }
        }
      } catch (err) {
        log.debug('Ignoring unusable persisted startup info', { err });
      }
    }

    const [nodeInfo, genesisBlock] = await Promise.all([aztecNode.getNodeInfo(), aztecNode.getBlock(BlockNumber.ZERO)]);
    const initialBlockHash = genesisBlock?.hash ?? GENESIS_BLOCK_HEADER_HASH;

    if (singleton) {
      try {
        await singleton.set(
          jsonStringify({ url, versionKey: key, nodeInfo, initialBlockHash: initialBlockHash.toString() }),
        );
      } catch (err) {
        log.debug('Failed to persist startup info', { err });
      }
    }

    return { nodeInfo, initialBlockHash };
  } finally {
    await cacheStore?.close().catch(err => log.debug('Failed to close node info cache store', { err }));
  }
}
