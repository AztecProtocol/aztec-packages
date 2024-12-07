import {
  type BlockAttestation,
  type BlockProposal,
  type L2Block,
  type ProcessedTx,
  type Tx,
  type TxHash,
} from '@aztec/circuit-types';
import { type GlobalVariables, type Header } from '@aztec/circuits.js';
import { type EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type Timer } from '@aztec/foundation/timer';
import { type P2P } from '@aztec/p2p';
import { type TelemetryClient, WithTracer } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import {
  AttestationTimeoutError,
  BlockBuilderNotProvidedError,
  InvalidValidatorPrivateKeyError,
  ReExStateMismatchError,
  TransactionsNotAvailableError,
} from './errors/validator.error.js';
import { type ValidatorKeyStore } from './key_store/interface.js';
import { LocalKeyStore } from './key_store/local_key_store.js';
import { ValidatorMetrics } from './metrics.js';

/**
 * Callback function for building a block
 *
 * We reuse the sequencer's block building functionality for re-execution
 */
type BlockBuilderCallback = (
  txs: Tx[],
  globalVariables: GlobalVariables,
  historicalHeader?: Header,
  interrupt?: (processedTxs: ProcessedTx[]) => Promise<void>,
) => Promise<{ block: L2Block; publicProcessorDuration: number; numProcessedTxs: number; blockBuildingTimer: Timer }>;

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;
  registerBlockBuilder(blockBuilder: BlockBuilderCallback): void;

  // Block validation responsiblities
  createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal | undefined>;
  attestToProposal(proposal: BlockProposal): void;

  broadcastBlockProposal(proposal: BlockProposal): void;
  collectAttestations(proposal: BlockProposal, numberOfRequiredAttestations: number): Promise<BlockAttestation[]>;
}

/**
 * Validator Client
 */
export class ValidatorClient extends WithTracer implements Validator {
  private validationService: ValidationService;
  private metrics: ValidatorMetrics;

  // Used to check if we are sending the same proposal twice
  private previousProposal?: BlockProposal;

  // Callback registered to: sequencer.buildBlock
  private blockBuilder?: BlockBuilderCallback = undefined;

  constructor(
    private keyStore: ValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private config: ValidatorClientConfig,
    telemetry: TelemetryClient = new NoopTelemetryClient(),
    private log = createDebugLogger('aztec:validator'),
  ) {
    // Instantiate tracer
    super(telemetry, 'Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore);
    this.log.verbose('Initialized validator');
  }

  static new(
    config: ValidatorClientConfig,
    epochCache: EpochCache,
    p2pClient: P2P,
    telemetry: TelemetryClient = new NoopTelemetryClient(),
  ) {
    if (!config.validatorPrivateKey) {
      throw new InvalidValidatorPrivateKeyError();
    }

    const privateKey = validatePrivateKey(config.validatorPrivateKey);
    const localKeyStore = new LocalKeyStore(privateKey);

    const validator = new ValidatorClient(localKeyStore, epochCache, p2pClient, config, telemetry);
    validator.registerBlockProposalHandler();
    return validator;
  }

  public start() {
    // Sync the committee from the smart contract
    // https://github.com/AztecProtocol/aztec-packages/issues/7962

    this.log.info('Validator started');
    return Promise.resolve();
  }

  public registerBlockProposalHandler() {
    const handler = (block: BlockProposal): Promise<BlockAttestation | undefined> => {
      return this.attestToProposal(block);
    };
    this.p2pClient.registerBlockProposalHandler(handler);
  }

  /**
   * Register a callback function for building a block
   *
   * We reuse the sequencer's block building functionality for re-execution
   */
  public registerBlockBuilder(blockBuilder: BlockBuilderCallback) {
    this.blockBuilder = blockBuilder;
  }

  async attestToProposal(proposal: BlockProposal): Promise<BlockAttestation | undefined> {
    // Check that I am in the committee
    if (!(await this.epochCache.isInCommittee(this.keyStore.getAddress()))) {
      this.log.verbose(`Not in the committee, skipping attestation`);
      return undefined;
    }

    // Check that the proposal is from the current proposer, or the next proposer.
    const [currentProposer, nextSlotProposer] = await this.epochCache.getProposerInCurrentOrNextSlot();
    if (!proposal.getSender().equals(currentProposer) && !proposal.getSender().equals(nextSlotProposer)) {
      this.log.verbose(`Not the current or next proposer, skipping attestation`);
      return undefined;
    }

    // Check that all of the tranasctions in the proposal are available in the tx pool before attesting
    this.log.verbose(`request to attest`, {
      archive: proposal.payload.archive.toString(),
      txHashes: proposal.payload.txHashes.map(txHash => txHash.toString()),
    });
    try {
      await this.ensureTransactionsAreAvailable(proposal);

      if (this.config.validatorReexecute) {
        this.log.verbose(`Re-executing transactions in the proposal before attesting`);
        await this.reExecuteTransactions(proposal);
      }
    } catch (error: any) {
      // If the transactions are not available, then we should not attempt to attest
      if (error instanceof TransactionsNotAvailableError) {
        this.log.error(`Transactions not available, skipping attestation ${error.message}`);
      } else {
        // This branch most commonly be hit if the transactions are available, but the re-execution fails
        // Catch all error handler
        this.log.error(`Failed to attest to proposal: ${error.message}`);
      }
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.verbose(
      `Transactions available, attesting to proposal with ${proposal.payload.txHashes.length} transactions`,
    );

    // If the above function does not throw an error, then we can attest to the proposal
    return this.validationService.attestToProposal(proposal);
  }

  /**
   * Re-execute the transactions in the proposal and check that the state updates match the header state
   * @param proposal - The proposal to re-execute
   */
  async reExecuteTransactions(proposal: BlockProposal) {
    const { header, txHashes } = proposal.payload;

    const txs = (await Promise.all(txHashes.map(tx => this.p2pClient.getTxByHash(tx)))).filter(
      tx => tx !== undefined,
    ) as Tx[];

    // If we cannot request all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      this.log.error(`Failed to get transactions from the network: ${txHashes.join(', ')}`);
      throw new TransactionsNotAvailableError(txHashes);
    }

    // Assertion: This check will fail if re-execution is not enabled
    if (this.blockBuilder === undefined) {
      throw new BlockBuilderNotProvidedError();
    }

    // Use the sequencer's block building logic to re-execute the transactions
    const stopTimer = this.metrics.reExecutionTimer();
    const { block } = await this.blockBuilder(txs, header.globalVariables);
    stopTimer();

    this.log.verbose(`Re-ex: Re-execution complete`);

    // This function will throw an error if state updates do not match
    if (!block.archive.root.equals(proposal.archive)) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExStateMismatchError();
    }
  }

  /**
   * Ensure that all of the transactions in the proposal are available in the tx pool before attesting
   *
   * 1. Check if the local tx pool contains all of the transactions in the proposal
   * 2. If any transactions are not in the local tx pool, request them from the network
   * 3. If we cannot retrieve them from the network, throw an error
   * @param proposal - The proposal to attest to
   */
  async ensureTransactionsAreAvailable(proposal: BlockProposal) {
    const txHashes: TxHash[] = proposal.payload.txHashes;
    const transactionStatuses = await Promise.all(txHashes.map(txHash => this.p2pClient.getTxStatus(txHash)));

    const missingTxs = txHashes.filter((_, index) => !['pending', 'mined'].includes(transactionStatuses[index] ?? ''));

    if (missingTxs.length === 0) {
      return; // All transactions are available
    }

    this.log.verbose(`Missing ${missingTxs.length} transactions in the tx pool, requesting from the network`);

    const requestedTxs = await this.p2pClient.requestTxs(missingTxs);
    if (requestedTxs.some(tx => tx === undefined)) {
      this.log.error(`Failed to request transactions from the network: ${missingTxs.join(', ')}`);
      throw new TransactionsNotAvailableError(missingTxs);
    }
  }

  async createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal | undefined> {
    if (this.previousProposal?.slotNumber.equals(header.globalVariables.slotNumber)) {
      this.log.verbose(`Already made a proposal for the same slot, skipping proposal`);
      return Promise.resolve(undefined);
    }

    const newProposal = await this.validationService.createBlockProposal(header, archive, txs);
    this.previousProposal = newProposal;
    return newProposal;
  }

  broadcastBlockProposal(proposal: BlockProposal): void {
    this.p2pClient.broadcastProposal(proposal);
  }

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7962)
  async collectAttestations(
    proposal: BlockProposal,
    numberOfRequiredAttestations: number,
  ): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this block until we have enough attestations
    const slot = proposal.payload.header.globalVariables.slotNumber.toBigInt();
    this.log.info(`Waiting for ${numberOfRequiredAttestations} attestations for slot: ${slot}`);

    const proposalId = proposal.archive.toString();
    const myAttestation = await this.validationService.attestToProposal(proposal);

    const startTime = Date.now();

    while (true) {
      const attestations = [myAttestation, ...(await this.p2pClient.getAttestationsForSlot(slot, proposalId))];

      if (attestations.length >= numberOfRequiredAttestations) {
        this.log.info(`Collected all ${numberOfRequiredAttestations} attestations for slot, ${slot}`);
        return attestations;
      }

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > this.config.attestationWaitTimeoutMs) {
        this.log.error(`Timeout waiting for ${numberOfRequiredAttestations} attestations for slot, ${slot}`);
        throw new AttestationTimeoutError(numberOfRequiredAttestations, slot);
      }

      this.log.verbose(
        `Collected ${attestations.length} attestations so far, waiting ${this.config.attestationPollingIntervalMs}ms for more...`,
      );
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }
}

function validatePrivateKey(privateKey: string): Buffer32 {
  try {
    return Buffer32.fromString(privateKey);
  } catch (error) {
    throw new InvalidValidatorPrivateKeyError();
  }
}
