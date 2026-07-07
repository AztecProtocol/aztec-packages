import type { ContractArtifact } from '@aztec/aztec.js/abi';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { type ContractBase, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { PublicKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { CheatCodes } from '@aztec/aztec/testing';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';
import type { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { PXEConfig } from '@aztec/pxe/config';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { AztecNodeAdmin, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { type EndToEndContext, type SetupOptions, setup, teardown } from '../fixtures/setup.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';

export type AutomineTestOpts = Partial<SetupOptions> & {
  /** Number of accounts to create and deploy during setup. */
  numberOfAccounts?: number;
  /** Options forwarded to PXE creation. */
  pxeOpts?: Partial<PXEConfig>;
};

/**
 * Base class for the automine-sequencer test topology: a single in-process node running the
 * deterministic {@link AUTOMINE_E2E_OPTS} preset (one block per submitted tx, synchronous L1 publish,
 * no committee, no prover, no validator client). Owns the environment (in-proc anvil in automine mode
 * plus the L1 deploy) and exposes the handles every automine test uses (`wallet`, `aztecNode`,
 * `cheatCodes`, `sequencer`, `accounts`, `logger`).
 *
 * The sibling of {@link SingleNodeTestContext}: both wrap the same underlying `fixtures/setup.ts:setup()`
 * but fix opposite sequencer topologies. Making {@link AUTOMINE_E2E_OPTS} the base default removes the
 * per-test-file spread every automine test would otherwise repeat.
 *
 * Domain harnesses (the token simulators) compose on top by extending this base and overriding
 * {@link setup} to run their domain steps after `super.setup()`.
 */
export class AutomineTestContext {
  public context!: EndToEndContext;
  public logger!: Logger;
  public wallet!: TestWallet;
  public aztecNode!: AztecNode & AztecNodeDebug;
  public aztecNodeAdmin!: AztecNodeAdmin;
  public cheatCodes!: CheatCodes;
  public sequencer!: SequencerClient;
  public accounts!: AztecAddress[];
  public defaultAccountAddress!: AztecAddress;

  public parentContract!: ParentContract;
  public childContract!: ChildContract;

  public static async setup<T extends AutomineTestContext>(this: new () => T, opts: AutomineTestOpts = {}): Promise<T> {
    const test = new this();
    await test.setup(opts);
    return test;
  }

  public async setup(opts: AutomineTestOpts = {}): Promise<void> {
    const { numberOfAccounts = 1, pxeOpts, ...setupOpts } = opts;
    const context = await setup(
      numberOfAccounts,
      {
        ...AUTOMINE_E2E_OPTS,
        fundSponsoredFPC: true,
        ...setupOpts,
      },
      pxeOpts,
    );
    await this.hydrateFromContext(context);
  }

  /**
   * Populates the context-derived handles from an already-built {@link EndToEndContext}. Split out of
   * {@link setup} so domain harnesses that build the environment with their own bespoke `setup(...)`
   * opts can still reuse the shared handle wiring.
   */
  protected hydrateFromContext(context: EndToEndContext): Promise<void> {
    this.context = context;
    this.logger = context.logger;
    this.wallet = context.wallet;
    this.aztecNode = context.aztecNodeService;
    this.aztecNodeAdmin = context.aztecNodeService;
    this.cheatCodes = context.cheatCodes;
    this.sequencer = context.sequencer!;
    this.accounts = context.accounts;
    this.defaultAccountAddress = context.accounts[0];
    return Promise.resolve();
  }

  public async teardown(): Promise<void> {
    await teardown(this.context);
  }

  /**
   * Marks the current pending checkpoints as proven, then warps the L2 clock forward by `seconds`.
   *
   * Under {@link AUTOMINE_E2E_OPTS} a long warp crosses many epochs with no proofs being submitted, so
   * without a prior `markAsProven()` the rollup contract's pruning window resets the chain tip to genesis
   * and the warp's own empty-checkpoint propose fails with `Rollup__InvalidArchive`. Marking proven before
   * warping keeps the pending chain alive. Composes the existing `cheatCodes.rollup.markAsProven` and
   * `warpL2TimeAtLeastBy` with that required ordering.
   */
  public async markProvenAndWarp(seconds: number | bigint): Promise<void> {
    await this.cheatCodes.rollup.markAsProven();
    await this.cheatCodes.warpL2TimeAtLeastBy(this.aztecNode, seconds);
  }

  /** Computes and registers a contract instance in the wallet without deploying it on-chain. */
  public async registerContract<T extends ContractBase>(
    wallet: Wallet,
    contractArtifact: ContractArtifactClass<T>,
    opts: {
      salt?: Fr;
      publicKeys?: PublicKeys;
      initArgs?: any[];
      constructorName?: string;
      deployer?: AztecAddress;
    } = {},
  ): Promise<T> {
    const { salt, publicKeys, initArgs, constructorName, deployer } = opts;
    const instance = await getContractInstanceFromInstantiationParams(contractArtifact.artifact, {
      constructorArgs: initArgs ?? [],
      constructorArtifact: constructorName,
      salt: salt ?? Fr.random(),
      publicKeys,
      deployer,
    });
    await wallet.registerContract(instance, contractArtifact.artifact);
    return contractArtifact.at(instance.address, wallet);
  }

  /** Deploys a Parent and a Child contract from the default account for the nested-call tests. */
  public async applyManualParentChild(): Promise<void> {
    this.logger.info('Deploying parent and child contracts');
    ({ contract: this.parentContract } = await ParentContract.deploy(this.wallet).send({
      from: this.defaultAccountAddress,
    }));
    ({ contract: this.childContract } = await ChildContract.deploy(this.wallet).send({
      from: this.defaultAccountAddress,
    }));
  }
}

export type StatefulContractCtorArgs = Parameters<StatefulTestContract['methods']['constructor']>;

export type ContractArtifactClass<T extends ContractBase> = {
  at(address: AztecAddress, wallet: Wallet): T;
  artifact: ContractArtifact;
};
