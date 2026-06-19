import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract, type SlashingProposerContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { ViemClient } from '@aztec/ethereum/types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { SlasherAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, getAddress, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { MultiNodeTestContext, type MultiNodeTestOpts } from './multi_node_test_context.js';

/** A validator with its on-chain operator data and the L1 private key its node signs with. */
export type RegisteredValidator = Operator & { privateKey: `0x${string}` };

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
    const validators = ValidatorRegistrationHarness.buildValidators(opts.numberOfValidators);
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
    return times(count, i => ValidatorRegistrationHarness.validatorForIndex(i));
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

  private static validatorForIndex(index: number): RegisteredValidator {
    // Match P2PNetworkTest's ATTESTER_PRIVATE_KEYS_START_INDEX (3): keys 0..2 are reserved for the
    // setup account, bootstrap node, and prover node, so validator keys begin at index 3.
    const privateKey = bufferToHex(getPrivateKeyFromIndex(index + 3)!);
    const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
    return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
  }
}
