import { blockParameterHash, inspectBlockParameter } from '@aztec/stdlib/block';
import type { L2LogsSource, ResolvedLogsQuery } from '@aztec/stdlib/interfaces/server';
import type { LogResult, LogsQueryBase, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';

import { normalizeBlockParameter } from './block_parameter.js';
import type { UnseenBlockHoldOff } from './unseen_block_hold_off.js';

/**
 * Serves the node's tagged-log read queries, resolving each query's reorg-safety anchor to the concrete block hash
 * the logs source checks against. Extracted from `AztecNodeService` to keep `server.ts` smaller.
 */
export class NodeLogsProvider {
  constructor(
    private readonly logsSource: L2LogsSource,
    private readonly holdOff: UnseenBlockHoldOff,
  ) {}

  public async getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    return await this.logsSource.getPrivateLogsByTags(await this.#resolveReferenceBlock(query));
  }

  public async getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    return await this.logsSource.getPublicLogsByTags(await this.#resolveReferenceBlock(query));
  }

  /**
   * Resolves a logs query's reorg-safety anchor to a concrete block hash, holding the request briefly when the node
   * has not seen that block yet — a client that synced one block ahead through another node is then answered instead
   * of failed over a transient skew. Anchors naming a block by number, by tag, or by archive root are resolved here as
   * well, since the logs source only understands a hash.
   *
   * A miss is answered by whoever can describe it best. An anchor that already names a hash is passed on as that bare
   * hash, so the logs source's in-transaction check — the authoritative one, and the one that knows the genesis anchor
   * a client syncs from before it has seen a block — raises the error it always did. Any other form has no hash to
   * pass on, so the miss is reported here.
   */
  async #resolveReferenceBlock<T extends LogsQueryBase>(query: T): Promise<ResolvedLogsQuery<T>> {
    const { referenceBlock, ...rest } = query;
    if (referenceBlock === undefined) {
      return rest;
    }
    const anchor = await this.holdOff.getBlockData(normalizeBlockParameter(referenceBlock));
    if (anchor !== undefined) {
      return { ...rest, referenceBlock: anchor.blockHash };
    }
    const anchorHash = blockParameterHash(referenceBlock);
    if (anchorHash === undefined) {
      throw new Error(
        `Reference block ${inspectBlockParameter(referenceBlock)} not found in the node. This might indicate a reorg ` +
          `has occurred.`,
      );
    }
    return { ...rest, referenceBlock: anchorHash };
  }
}
