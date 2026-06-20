import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import type { L2Tips } from '@aztec/stdlib/block';
import type { AztecNode, BlockResponse } from '@aztec/stdlib/interfaces/client';
import { createSharedSlashingProtectionDb } from '@aztec/validator-ha-signer/factory';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { SingleNodeTestContext, type SingleNodeTestOpts } from './single_node_test_context.js';

export {
  WORLD_STATE_CHECKPOINT_HISTORY,
  WORLD_STATE_BLOCK_CHECK_INTERVAL,
  ARCHIVER_POLL_INTERVAL,
  DEFAULT_L1_BLOCK_TIME,
  FAST_REORG_TIMING,
  type BlockProposedEvent,
  type TrackedSequencerEvent,
  type SingleNodeTestOpts,
} from './single_node_test_context.js';

/** Options for {@link MultiNodeTestContext.setup} — superset of {@link SingleNodeTestOpts}. */
export type MultiNodeTestOpts = SingleNodeTestOpts;

/** A registered validator with its on-chain operator data and the L1 private key its node signs with. */
export type RegisteredValidator = Operator & { privateKey: `0x${string}` };

/**
 * Builds the deterministic validator set used across the multi-validator tests: `count` validators
 * keyed from `getPrivateKeyFromIndex(i + 3)` (indices 0..2 are reserved for the setup account,
 * bootstrap node, and prover node, matching the `P2PNetworkTest` convention). This replaces the
 * `times(N, i => ({ attester, withdrawer, privateKey, bn254SecretKey }))` block copy-pasted in every
 * direct multi-validator test, and backs {@link ValidatorRegistrationHarness.buildValidators}.
 */
export function buildMockGossipValidators(count: number): RegisteredValidator[] {
  return times(count, i => {
    const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
    const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
    return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
  });
}

/**
 * The shared `setup` cluster for the multi-validator tests that run a tight committee on the
 * in-memory mock-gossip bus without a prover (consensus / prune tests). Spread into the `setup`
 * call alongside `initialValidators` (from {@link buildMockGossipValidators}). Tests that want a
 * prover (MBPS / HA-sync) leave `startProverNode` explicit rather than adopting this preset's `false`.
 */
export const MOCK_GOSSIP_MULTI_VALIDATOR_OPTS = {
  mockGossipSubNetwork: true,
  skipInitialSequencer: true,
  startProverNode: false,
  aztecProofSubmissionEpochs: 1024,
  numberOfAccounts: 0,
} as const;

/** The per-offense penalty knobs a slashing test tunes; all default to a single `unit`. */
export type SlashingPenalties = {
  slashInactivityPenalty: bigint;
  slashDataWithholdingPenalty: bigint;
  slashBroadcastedInvalidBlockPenalty: bigint;
  slashBroadcastedInvalidCheckpointProposalPenalty: bigint;
  slashDuplicateProposalPenalty: bigint;
  slashDuplicateAttestationPenalty: bigint;
  slashProposeInvalidAttestationsPenalty: bigint;
  slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty: bigint;
  slashAttestInvalidCheckpointProposalPenalty: bigint;
  slashUnknownPenalty: bigint;
};

/** The names of every per-offense penalty knob, in declaration order. */
const SLASHING_PENALTY_KEYS: (keyof SlashingPenalties)[] = [
  'slashInactivityPenalty',
  'slashDataWithholdingPenalty',
  'slashBroadcastedInvalidBlockPenalty',
  'slashBroadcastedInvalidCheckpointProposalPenalty',
  'slashDuplicateProposalPenalty',
  'slashDuplicateAttestationPenalty',
  'slashProposeInvalidAttestationsPenalty',
  'slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty',
  'slashAttestInvalidCheckpointProposalPenalty',
  'slashUnknownPenalty',
];

/**
 * Returns every per-offense slashing penalty set to `unit` (default `1e14` — small enough not to
 * kick a validator out). Spread alongside the slashing-round/quorum config in a slashing test's
 * `setup`.
 */
export function defaultSlashingPenalties(unit: bigint = BigInt(1e14)): SlashingPenalties {
  return Object.fromEntries(SLASHING_PENALTY_KEYS.map(key => [key, unit])) as SlashingPenalties;
}

/**
 * Returns the penalties with only `offense` set to `unit` and every other offense zeroed out, so a
 * test isolates a single slashing offense. Names the test's intent (which offense is under test) and
 * replaces the ~9-line manual zero-out block.
 */
export function withOnlyOffense(offense: keyof SlashingPenalties, unit: bigint = BigInt(1e14)): SlashingPenalties {
  return Object.fromEntries(SLASHING_PENALTY_KEYS.map(key => [key, key === offense ? unit : 0n])) as SlashingPenalties;
}

/** One HA pair: its two member nodes, the two shared validator keys, and the per-node coinbases. */
export type HaPairNodes = {
  nodes: [AztecNodeService, AztecNodeService];
  privateKeys: [`0x${string}`, `0x${string}`];
  coinbases: [EthAddress, EthAddress];
};

/**
 * Stands up two HA pairs from the first four registered validators: nodes[0]/nodes[1] share keys
 * pk1+pk2, nodes[2]/nodes[3] share pk3+pk4. Each pair shares an in-memory slashing-protection DB (so
 * only one peer signs per duty) and each node gets a distinct coinbase. Encapsulates the ~40-line
 * pair-wiring duplicated by both HA tests; the per-test divergence (publishing disabled vs. enabled,
 * empty-checkpoint building) is passed through `baseOpts`.
 * @returns The four nodes flat, plus the two `HaPairNodes` descriptors.
 */
export async function setupHaPairs(
  test: MultiNodeTestContext,
  validators: RegisteredValidator[],
  opts: { baseOpts?: Partial<AztecNodeConfig> & { dontStartSequencer?: boolean }; coinbases?: EthAddress[] } = {},
): Promise<{ nodes: AztecNodeService[]; pairs: [HaPairNodes, HaPairNodes] }> {
  const baseOpts = opts.baseOpts ?? {};
  const coinbases = opts.coinbases ?? [1, 2, 3, 4].map(n => EthAddress.fromNumber(n));
  const [pk1, pk2, pk3, pk4] = validators.map(v => v.privateKey);
  const sharedDb1 = await createSharedSlashingProtectionDb(test.context.dateProvider);
  const sharedDb2 = await createSharedSlashingProtectionDb(test.context.dateProvider);

  const nodes = [
    await test.createValidatorNode([pk1, pk2], {
      ...baseOpts,
      coinbase: coinbases[0],
      slashingProtectionDb: sharedDb1,
    }),
    await test.createValidatorNode([pk1, pk2], {
      ...baseOpts,
      coinbase: coinbases[1],
      slashingProtectionDb: sharedDb1,
    }),
    await test.createValidatorNode([pk3, pk4], {
      ...baseOpts,
      coinbase: coinbases[2],
      slashingProtectionDb: sharedDb2,
    }),
    await test.createValidatorNode([pk3, pk4], {
      ...baseOpts,
      coinbase: coinbases[3],
      slashingProtectionDb: sharedDb2,
    }),
  ];

  const pairs: [HaPairNodes, HaPairNodes] = [
    { nodes: [nodes[0], nodes[1]], privateKeys: [pk1, pk2], coinbases: [coinbases[0], coinbases[1]] },
    { nodes: [nodes[2], nodes[3]], privateKeys: [pk3, pk4], coinbases: [coinbases[2], coinbases[3]] },
  ];

  return { nodes, pairs };
}

/**
 * Multi-validator test base: N validator nodes sharing the in-memory `MockGossipSubNetwork` bus, with
 * fast block times and short epochs. Extends {@link SingleNodeTestContext} with validator-node
 * spawning and the convergence helpers (`waitForAllNodes*`, `findSlotsWithProposers`) that only make
 * sense across a committee. The environment, prover lifecycle, and reorg/proving waiters live on the
 * parent so the single-node-topology tests share them.
 */
export class MultiNodeTestContext extends SingleNodeTestContext {
  public createValidatorNode(
    privateKeys: `0x${string}`[],
    opts: Partial<AztecNodeConfig> & {
      dontStartSequencer?: boolean;
      slashingProtectionDb?: SlashingProtectionDatabase;
    } = {},
  ) {
    this.logger.warn('Creating and syncing a validator node...');
    return this.createNode({ ...opts, disableValidator: false, validatorPrivateKeys: new SecretValue(privateKeys) });
  }

  /**
   * Polls every node until `predicate(tips, node)` holds for all of them. The multi-node
   * generalization of {@link SingleNodeTestContext.waitForNodeToSync} — replaces hand-rolled
   * `Promise.all(this.nodes.map(node => retryUntil(...)))` fan-out blocks.
   * @param nodes - Nodes to poll; defaults to all validator nodes (`this.nodes`).
   */
  public async waitForAllNodes(
    predicate: (tips: L2Tips, node: AztecNode) => boolean | Promise<boolean>,
    opts: { nodes?: AztecNode[]; timeout?: number; interval?: number; description?: string } = {},
  ): Promise<void> {
    const nodes = opts.nodes ?? this.nodes;
    const timeout = opts.timeout ?? this.L2_SLOT_DURATION_IN_S * 4;
    const interval = opts.interval ?? 0.5;
    const description = opts.description ?? 'all nodes to reach target';
    await Promise.all(
      nodes.map((node, idx) =>
        retryUntil(
          async () => {
            const tips = await node.getChainTips();
            return (await predicate(tips, node)) || undefined;
          },
          `node ${idx} ${description}`,
          timeout,
          interval,
        ),
      ),
    );
  }

  /** Waits until every node's proven checkpoint tip reaches `target`. */
  public waitForAllNodesToReachProvenCheckpoint(
    target: CheckpointNumber,
    opts: { nodes?: AztecNode[]; timeout?: number; interval?: number } = {},
  ): Promise<void> {
    return this.waitForAllNodes(tips => tips.proven.checkpoint.number >= target, {
      ...opts,
      description: `proven checkpoint >= ${target}`,
    });
  }

  /**
   * Waits until every node's `proposed` or `checkpointed` tip points at a block whose slot
   * satisfies `match` (defaults to "slot equals `slot`"). Polls the block referenced by the tip.
   */
  public waitForAllNodesToReachBlockAtSlot(
    slot: SlotNumber,
    tag: 'proposed' | 'checkpointed',
    match: (block: BlockResponse) => boolean = block => block.header.globalVariables.slotNumber === slot,
    opts: { nodes?: AztecNode[]; timeout?: number; interval?: number } = {},
  ): Promise<void> {
    return this.waitForAllNodes(
      async (tips, node) => {
        const blockNumber = tag === 'proposed' ? tips.proposed.number : tips.checkpointed.block.number;
        if (blockNumber === 0) {
          return false;
        }
        const block = await node.getBlock(blockNumber);
        return !!block && match(block);
      },
      { ...opts, description: `${tag} block at slot ${slot}` },
    );
  }

  /**
   * Finds `count` consecutive slots (starting from `opts.fromSlot` or the current slot plus a
   * margin) whose proposers satisfy `predicate`, warping the L1 clock forward one epoch and
   * retrying when the rollup reports `ValidatorSelection__EpochNotStable` for a future epoch.
   * Returns the matched slots and their proposer addresses. Encapsulates the slot-search loop
   * duplicated across the multi-validator tests.
   */
  public async findSlotsWithProposers(
    count: number,
    predicate: (proposers: EthAddress[]) => boolean,
    opts: { fromSlot?: SlotNumber; margin?: number; maxAttempts?: number } = {},
  ): Promise<{ slots: SlotNumber[]; proposers: EthAddress[] }> {
    const margin = opts.margin ?? 4;
    const maxAttempts = opts.maxAttempts ?? 200;
    let candidate = opts.fromSlot ?? SlotNumber(Number(this.epochCache.getEpochAndSlotNow().slot) + margin);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const slots = Array.from({ length: count }, (_, i) => SlotNumber(candidate + i));
        const maybeProposers = await Promise.all(
          slots.map(slot => this.epochCache.getProposerAttesterAddressInSlot(slot)),
        );
        if (maybeProposers.every((p): p is EthAddress => p !== undefined) && predicate(maybeProposers)) {
          return { slots, proposers: maybeProposers };
        }
        candidate = SlotNumber(candidate + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await this.l1Client.getBlock({ includeTransactions: false });
        const warpBy = this.epochDuration * this.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        this.logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await this.context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(this.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + margin) {
          candidate = SlotNumber(newCurrentSlot + margin);
        }
      }
    }
    throw new Error(
      `Could not find ${count} consecutive slots matching the proposer predicate after ${maxAttempts} attempts`,
    );
  }
}
