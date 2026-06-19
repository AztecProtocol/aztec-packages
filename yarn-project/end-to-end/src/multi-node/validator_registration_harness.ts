import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract, type SlashingProposerContract } from '@aztec/ethereum/contracts';
import type { ViemClient } from '@aztec/ethereum/types';
import { SlasherAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, getAddress, getContract } from 'viem';

import {
  MultiNodeTestContext,
  type MultiNodeTestOpts,
  type RegisteredValidator,
  buildMockGossipValidators,
} from './multi_node_test_context.js';

export type { RegisteredValidator } from './multi_node_test_context.js';

/** The slasher and slashing-proposer L1 contracts a slashing test interacts with. */
export type SlashingContracts = {
  rollup: RollupContract;
  slasherContract: GetContractReturnType<typeof SlasherAbi, ViemClient>;
  slashingProposer: SlashingProposerContract | undefined;
};

export type ValidatorRegistrationHarnessOpts = MultiNodeTestOpts & {
  /** Number of validators to register on-chain (committee size). */
  numberOfValidators: number;
};

/**
 * Registers a set of validators on a {@link MultiNodeTestContext} (the mock-gossip multi-node base)
 * and exposes the per-validator keys/addresses plus the slasher contracts that slashing and sentinel
 * tests need. It is the mock-gossip replacement for the validator-registration half of
 * `P2PNetworkTest` (MultiAdder/GSE staking + epoch-lag advance), which only ran over real libp2p:
 * here registration goes through `MultiNodeTestContext.setup({ initialValidators })`, which deploys
 * the L1 contracts with the validators staked at genesis and advances past the validator-set lag, so
 * the committee is active by the time `create` resolves.
 *
 * Composition over inheritance: the harness wraps a `MultiNodeTestContext` (`this.context`) rather
 * than extending it, so tests use the context's node-spawning and waiters directly and reach for the
 * harness only for registration data and the slasher contracts.
 */
export class ValidatorRegistrationHarness {
  private constructor(
    public readonly context: MultiNodeTestContext,
    public readonly validators: RegisteredValidator[],
  ) {}

  public get logger(): Logger {
    return this.context.logger;
  }

  /**
   * Builds `numberOfValidators` validators from the deterministic attester key indices (matching the
   * `P2PNetworkTest` convention of starting at index 3, after the setup/bootstrap/prover keys), stands
   * up a `MultiNodeTestContext` with them registered on the mock-gossip bus, and returns the harness.
   * The validators are NOT given running nodes — tests spawn nodes for whichever validators they want
   * online via `createValidatorNode`, leaving the rest registered-but-offline.
   */
  public static async create(opts: ValidatorRegistrationHarnessOpts): Promise<ValidatorRegistrationHarness> {
    const validators = buildMockGossipValidators(opts.numberOfValidators);
    const context = await MultiNodeTestContext.setup({
      mockGossipSubNetwork: true,
      skipInitialSequencer: true,
      slasherEnabled: true,
      ...opts,
      initialValidators: validators,
      aztecTargetCommitteeSize: opts.aztecTargetCommitteeSize ?? opts.numberOfValidators,
    });
    return new ValidatorRegistrationHarness(context, validators);
  }

  /** Builds the deterministic validator set used for registration (indices 3..3+count). */
  public static buildValidators(count: number): RegisteredValidator[] {
    return buildMockGossipValidators(count);
  }

  /** Returns the validator at on-chain index `index` (0-based into the registered set). */
  public validatorAt(index: number): RegisteredValidator {
    return this.validators[index];
  }

  /** The L1 attester address of the validator registered at `index`. */
  public addressAt(index: number): EthAddress {
    return this.validators[index].attester;
  }

  /** The L1 signing key of the validator registered at `index`. */
  public privateKeyAt(index: number): `0x${string}` {
    return this.validators[index].privateKey;
  }

  /**
   * Spawns a validator node on the mock-gossip bus signing with the validator at `index`. Pass the
   * same `index` to two calls (with different `coinbase`) to model an equivocating proposer that
   * shares a key across two nodes.
   */
  public createValidatorNode(
    index: number,
    opts: Partial<AztecNodeConfig> & { dontStartSequencer?: boolean } = {},
  ): Promise<AztecNodeService> {
    return this.context.createValidatorNode([this.privateKeyAt(index)], opts);
  }

  /** Resolves the rollup, slasher, and slashing-proposer L1 contracts (mirrors `P2PNetworkTest.getContracts`). */
  public async getContracts(): Promise<SlashingContracts> {
    const rollup = this.context.rollup;
    const slasherContract = getContract({
      address: getAddress((await rollup.getSlasherAddress()).toString()),
      abi: SlasherAbi,
      client: this.context.l1Client,
    });
    const slashingProposer = await rollup.getSlashingProposer();
    return { rollup, slasherContract, slashingProposer };
  }

  public teardown(): Promise<void> {
    return this.context.teardown();
  }
}
