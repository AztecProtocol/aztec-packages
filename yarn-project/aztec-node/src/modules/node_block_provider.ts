import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import type {
  BlockData,
  BlockParameter,
  CommitteeAttestation,
  L2Block,
  L2BlockSource,
  NormalizedBlockParameter,
} from '@aztec/stdlib/block';
import type { CheckpointData, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type {
  BlockIncludeOptions,
  BlockResponse,
  BlocksIncludeOptions,
  CheckpointIncludeOptions,
  CheckpointParameter,
  CheckpointResponse,
} from '@aztec/stdlib/interfaces/client';

import {
  blockResponseFromBlockData,
  blockResponseFromL2Block,
  checkpointResponseFromCheckpointData,
  checkpointResponseFromPublishedCheckpoint,
  projectProposedToCheckpointResponse,
} from '../aztec-node/block_response_helpers.js';
import { normalizeBlockParameter, resolveCheckpointParameter } from './block_parameter.js';
import type { UnseenBlockHoldOff } from './unseen_block_hold_off.js';

/**
 * Serves the node's block and checkpoint read queries, assembling RPC responses (optionally including
 * transactions, L1 publish info, and attestations) from the underlying block source. Extracted from
 * `AztecNodeService` to keep `server.ts` smaller.
 */
export class NodeBlockProvider {
  constructor(
    private readonly blockSource: L2BlockSource,
    private readonly holdOff: UnseenBlockHoldOff,
  ) {}

  public async getBlock<Opts extends BlockIncludeOptions = {}>(
    param: BlockParameter,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts> | undefined> {
    const query = normalizeBlockParameter(param);
    const wantTxs = !!options.includeTransactions;
    const wantContext = !!options.includeL1PublishInfo || !!options.includeAttestations;

    if (wantTxs) {
      const block = (await this.blockSource.getBlock(query)) ?? (await this.#getBlockAfterHoldOff(query));
      if (!block) {
        return undefined;
      }
      const ctx = wantContext ? await this.#getCheckpointContext(block.checkpointNumber) : undefined;
      return (await blockResponseFromL2Block(block, options, ctx)) as BlockResponse<Opts>;
    }
    const data = await this.holdOff.getBlockData(query);
    if (!data) {
      return undefined;
    }
    const ctx = wantContext ? await this.#getCheckpointContext(data.checkpointNumber) : undefined;
    return blockResponseFromBlockData(data, options, ctx) as BlockResponse<Opts>;
  }

  public getBlockData(param: BlockParameter): Promise<BlockData | undefined> {
    const query = normalizeBlockParameter(param);
    return this.holdOff.getBlockData(query);
  }

  public async getBlocks<Opts extends BlocksIncludeOptions = {}>(
    from: BlockNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<BlockResponse<Opts>[]> {
    const wantTxs = !!options.includeTransactions;
    const wantContext = !!options.includeL1PublishInfo || !!options.includeAttestations;
    const onlyCheckpointed = !!options.onlyCheckpointed;
    if (wantTxs) {
      const blocks = await this.blockSource.getBlocks({ from, limit, onlyCheckpointed });
      const ctxByCheckpoint = await this.#getCheckpointContextsForBlocks(wantContext ? blocks : []);
      return (await Promise.all(
        blocks.map(block => blockResponseFromL2Block(block, options, ctxByCheckpoint.get(block.checkpointNumber))),
      )) as BlockResponse<Opts>[];
    }
    const dataItems = await this.blockSource.getBlocksData({ from, limit, onlyCheckpointed });
    const ctxByCheckpoint = await this.#getCheckpointContextsForBlocks(wantContext ? dataItems : []);
    return (await Promise.all(
      dataItems.map(data => blockResponseFromBlockData(data, options, ctxByCheckpoint.get(data.checkpointNumber))),
    )) as BlockResponse<Opts>[];
  }

  public async getCheckpoint<Opts extends CheckpointIncludeOptions = {}>(
    param: CheckpointParameter,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts> | undefined> {
    const query = await resolveCheckpointParameter(param, this.blockSource);

    // Try the confirmed store first.
    const confirmed = options.includeBlocks
      ? await this.blockSource.getCheckpoint(query)
      : await this.blockSource.getCheckpointData(query);
    if (confirmed) {
      return (await (options.includeBlocks
        ? checkpointResponseFromPublishedCheckpoint(confirmed as PublishedCheckpoint, options)
        : checkpointResponseFromCheckpointData(confirmed as CheckpointData, options))) as CheckpointResponse<Opts>;
    }

    // Fall back to the proposed store.
    const proposed = await this.blockSource.getProposedCheckpointData(query);
    if (proposed) {
      if (options.includeAttestations || options.includeL1PublishInfo) {
        throw new BadRequestError(
          `Options includeL1PublishInfo or includeAttestations cannot be satisfied for a proposed checkpoint`,
        );
      }
      const blocks = options.includeBlocks
        ? await this.blockSource.getBlocks({ from: proposed.startBlock, limit: proposed.blockCount })
        : undefined;
      return (await projectProposedToCheckpointResponse(proposed, options, blocks)) as CheckpointResponse<Opts>;
    }

    return undefined;
  }

  public async getCheckpoints<Opts extends CheckpointIncludeOptions = {}>(
    from: CheckpointNumber,
    limit: number,
    options: Opts = {} as Opts,
  ): Promise<CheckpointResponse<Opts>[]> {
    if (options.includeBlocks) {
      const checkpoints = await this.blockSource.getCheckpoints({ from, limit });
      return (await Promise.all(
        checkpoints.map(cp => checkpointResponseFromPublishedCheckpoint(cp, options)),
      )) as CheckpointResponse<Opts>[];
    }
    const datas = await this.blockSource.getCheckpointsData({ from, limit });
    return datas.map(d => checkpointResponseFromCheckpointData(d, options)) as CheckpointResponse<Opts>[];
  }

  /**
   * Waits briefly for a block the node is about to see, and re-reads it with transactions once it lands. Only
   * called after a plain miss, so it costs nothing on the happy path.
   */
  async #getBlockAfterHoldOff(query: NormalizedBlockParameter): Promise<L2Block | undefined> {
    const data = await this.holdOff.getBlockData(query);
    return data === undefined ? undefined : await this.blockSource.getBlock(query);
  }

  /** Fetches checkpoint-level L1 and attestation data for use as block response context. */
  async #getCheckpointContext(
    checkpointNumber: CheckpointNumber,
  ): Promise<{ l1?: L1PublishedData; attestations?: CommitteeAttestation[] } | undefined> {
    const checkpoint = await this.blockSource.getCheckpointData({ number: checkpointNumber });
    if (!checkpoint) {
      return undefined;
    }
    return { l1: checkpoint.l1, attestations: checkpoint.attestations };
  }

  /** Fetches checkpoint context for a set of blocks, deduplicating shared checkpoints. */
  async #getCheckpointContextsForBlocks(
    blocks: { checkpointNumber: CheckpointNumber }[],
  ): Promise<Map<CheckpointNumber, { l1?: L1PublishedData; attestations?: CommitteeAttestation[] } | undefined>> {
    const unique = Array.from(new Set(blocks.map(b => b.checkpointNumber)));
    const entries = await Promise.all(unique.map(async n => [n, await this.#getCheckpointContext(n)] as const));
    return new Map(entries);
  }
}
