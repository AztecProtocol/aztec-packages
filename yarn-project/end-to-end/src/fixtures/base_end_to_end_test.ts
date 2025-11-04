import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { CheatCodes } from '@aztec/aztec/testing';
import type { BlobSinkServer } from '@aztec/blob-sink/server';
import type { DeployL1ContractsReturnType } from '@aztec/ethereum';
import type { EthCheatCodes } from '@aztec/ethereum/test';
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { MockGossipSubNetwork } from '@aztec/p2p/test-helpers';
import type { ProverNode } from '@aztec/prover-node';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { TelemetryClient } from '@aztec/telemetry-client';
import type { TestWallet } from '@aztec/test-wallet/server';

import type { Anvil } from '@viem/anvil';

import { type EndToEndContext, type SetupOptions, setup } from './utils.js';

/**
 * Base class for end-to-end tests that provides common setup, teardown, and helper methods.
 */
export abstract class BaseEndToEndTest {
  public context!: EndToEndContext;

  // Core services
  public aztecNode!: AztecNodeService;
  public aztecNodeAdmin?: AztecNodeAdmin;
  public sequencer?: SequencerClient;
  public proverNode?: ProverNode;
  public wallet!: TestWallet;
  public cheatCodes!: CheatCodes;
  public ethCheatCodes!: EthCheatCodes;
  public dateProvider?: TestDateProvider;
  public blobSink?: BlobSinkServer;
  public telemetryClient?: TelemetryClient;

  // L1 related
  public deployL1ContractsValues!: DeployL1ContractsReturnType;
  public anvil?: Anvil;
  public watcher?: any;

  // Accounts
  public accounts: AztecAddress[] = [];
  public initialFundedAccounts: InitialAccountData[] = [];

  // P2P
  public mockGossipSubNetwork?: MockGossipSubNetwork;

  // Other
  public prefilledPublicData?: PublicDataTreeLeaf[];
  public logger: Logger;

  constructor(
    public readonly testName: string,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  /**
   * Sets up the test environment with the given options.
   */
  async setup(numberOfAccounts: number = 0, opts: SetupOptions = {}): Promise<this> {
    this.context = await setup(numberOfAccounts, opts);

    // Extract all the fields from context
    this.aztecNode = this.context.aztecNode;
    this.aztecNodeAdmin = this.context.aztecNodeAdmin;
    this.sequencer = this.context.sequencer;
    this.proverNode = this.context.proverNode;
    this.wallet = this.context.wallet;
    this.cheatCodes = this.context.cheatCodes;
    this.ethCheatCodes = this.context.ethCheatCodes;
    this.dateProvider = this.context.dateProvider;
    this.blobSink = this.context.blobSink;
    this.telemetryClient = this.context.telemetryClient;
    this.deployL1ContractsValues = this.context.deployL1ContractsValues;
    this.watcher = this.context.watcher;
    this.accounts = this.context.accounts;
    this.initialFundedAccounts = this.context.initialFundedAccounts;
    this.mockGossipSubNetwork = this.context.mockGossipSubNetwork;
    this.prefilledPublicData = this.context.prefilledPublicData;

    return this;
  }

  /**
   * Tears down the test environment.
   */
  async teardown() {
    await this.context?.teardown();
  }
}
