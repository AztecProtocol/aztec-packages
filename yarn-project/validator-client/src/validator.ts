import type { EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, type Timer } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { L2Block } from '@aztec/stdlib/block';
import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';
import type { BlockHeader, GlobalVariables, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, WithTracer, getTelemetryClient } from '@aztec/telemetry-client';

import type { ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import {
  AttestationTimeoutError,
  BlockBuilderNotProvidedError,
  InvalidValidatorPrivateKeyError,
  ReExFailedTxsError,
  ReExStateMismatchError,
  ReExTimeoutError,
  TransactionsNotAvailableError,
} from './errors/validator.error.js';
import type { ValidatorKeyStore } from './key_store/interface.js';
import { LocalKeyStore } from './key_store/local_key_store.js';
import { ValidatorMetrics } from './metrics.js';

/**
 * Callback function for building a block
 *
 * We reuse the sequencer's block building functionality for re-execution
 */
type BlockBuilderCallback = (
  txs: Iterable<Tx> | AsyncIterableIterator<Tx>,
  globalVariables: GlobalVariables,
  opts?: { validateOnly?: boolean },
) => Promise<{
  block: L2Block;
  publicProcessorDuration: number;
  numTxs: number;
  numFailedTxs: number;
  blockBuildingTimer: Timer;
}>;

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;
  registerBlockBuilder(blockBuilder: BlockBuilderCallback): void;

  // Block validation responsibilities
  createBlockProposal(header: BlockHeader, archive: Fr, txs: Tx[]): Promise<BlockProposal | undefined>;
  attestToProposal(proposal: BlockProposal): void;

  broadcastBlockProposal(proposal: BlockProposal): void;
  collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]>;
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

  private myAddress: EthAddress;
  private lastEpoch: bigint | undefined;
  private epochCacheUpdateLoop: RunningPromise;

  private blockProposalValidator: BlockProposalValidator;

  constructor(
    private keyStore: ValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private config: ValidatorClientConfig,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator'),
  ) {
    // Instantiate tracer
    super(telemetry, 'Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore);

    this.blockProposalValidator = new BlockProposalValidator(epochCache);

    // Refresh epoch cache every second to trigger alert if participation in commitee changes
    this.myAddress = this.keyStore.getAddress();
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommiteeUpdate.bind(this), log, 1000);

    this.log.verbose(`Initialized validator with address ${this.keyStore.getAddress().toString()}`);
  }

  private async handleEpochCommiteeUpdate() {
    try {
      const { committee, epoch } = await this.epochCache.getCommittee('now');
      if (epoch !== this.lastEpoch) {
        const me = this.myAddress;
        if (committee.some(addr => addr.equals(me))) {
          this.log.info(`Validator ${me.toString()} is on the validator committee for epoch ${epoch}`);
        } else {
          this.log.verbose(`Validator ${me.toString()} not on the validator committee for epoch ${epoch}`);
        }
        this.lastEpoch = epoch;
      }
    } catch (err) {
      this.log.error(`Error updating epoch committee`, err);
    }
  }

  static new(
    config: ValidatorClientConfig,
    epochCache: EpochCache,
    p2pClient: P2P,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    if (!config.validatorPrivateKey) {
      throw new InvalidValidatorPrivateKeyError();
    }

    const privateKey = validatePrivateKey(config.validatorPrivateKey);
    const localKeyStore = new LocalKeyStore(privateKey);

    const validator = new ValidatorClient(localKeyStore, epochCache, p2pClient, config, dateProvider, telemetry);
    validator.registerBlockProposalHandler();
    return validator;
  }

  public getValidatorAddress() {
    return this.keyStore.getAddress();
  }

  public async start() {
    // Sync the committee from the smart contract
    // https://github.com/AztecProtocol/aztec-packages/issues/7962

    const me = this.keyStore.getAddress();
    const inCommittee = await this.epochCache.isInCommittee(me);
    if (inCommittee) {
      this.log.info(`Started validator with address ${me.toString()} in current validator committee`);
    } else {
      this.log.info(`Started validator with address ${me.toString()}`);
    }
    this.epochCacheUpdateLoop.start();
    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
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
    const slotNumber = proposal.slotNumber.toNumber();
    const proposalInfo = {
      slotNumber,
      blockNumber: proposal.payload.header.globalVariables.blockNumber.toNumber(),
      archive: proposal.payload.archive.toString(),
      txCount: proposal.payload.txHashes.length,
      txHashes: proposal.payload.txHashes.map(txHash => txHash.toString()),
    };
    this.log.verbose(`Received request to attest for slot ${slotNumber}`);

    // Check that I am in the committee
    if (!(await this.epochCache.isInCommittee(this.keyStore.getAddress()))) {
      this.log.verbose(`Not in the committee, skipping attestation`);
      return undefined;
    }

    // Check that the proposal is from the current proposer, or the next proposer.
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.verbose(`Proposal is not valid, skipping attestation`);
      this.metrics.incFailedAttestations('invalid_proposal');
      return undefined;
    }

    // Check that all of the transactions in the proposal are available in the tx pool before attesting
    this.log.verbose(`Processing attestation for slot ${slotNumber}`, proposalInfo);
    try {
      const txs = await this.ensureTransactionsAreAvailable(proposal);

      if (this.config.validatorReexecute) {
        this.log.verbose(`Re-executing transactions in the proposal before attesting`);
        await this.reExecuteTransactions(proposal, txs);
      }
    } catch (error: any) {
      if (error instanceof Error) {
        this.metrics.incFailedAttestations(error.name);
      } else {
        this.metrics.incFailedAttestations('unknown');
      }

      // If the transactions are not available, then we should not attempt to attest
      if (error instanceof TransactionsNotAvailableError) {
        this.log.error(`Transactions not available, skipping attestation`, error, proposalInfo);
      } else {
        // This branch most commonly be hit if the transactions are available, but the re-execution fails
        // Catch all error handler
        this.log.error(`Failed to attest to proposal`, error, proposalInfo);
      }
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(`Attesting to proposal for slot ${slotNumber}`, proposalInfo);
    this.metrics.incAttestations();

    // If the above function does not throw an error, then we can attest to the proposal
    return this.doAttestToProposal(proposal);
  }

  /**
   * Re-execute the transactions in the proposal and check that the state updates match the header state
   * @param proposal - The proposal to re-execute
   */
  async reExecuteTransactions(proposal: BlockProposal, txs: Tx[]) {
    const { header, txHashes } = proposal.payload;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = await Promise.all(txs.map(async tx => (await tx.getTxHash()).toString()));
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.includes(txHash.toString()));
      throw new TransactionsNotAvailableError(missingTxHashes);
    }

    // Assertion: This check will fail if re-execution is not enabled
    if (this.blockBuilder === undefined) {
      throw new BlockBuilderNotProvidedError();
    }

    // Use the sequencer's block building logic to re-execute the transactions
    const stopTimer = this.metrics.reExecutionTimer();
    const { block, numFailedTxs } = await this.blockBuilder(txs, header.globalVariables, {
      validateOnly: true,
    });
    stopTimer();

    this.log.verbose(`Transaction re-execution complete`);

    if (numFailedTxs > 0) {
      await this.metrics.recordFailedReexecution(proposal);
      throw new ReExFailedTxsError(numFailedTxs);
    }

    if (block.body.txEffects.length !== txHashes.length) {
      await this.metrics.recordFailedReexecution(proposal);
      throw new ReExTimeoutError();
    }

    // This function will throw an error if state updates do not match
    if (!block.archive.root.equals(proposal.archive)) {
      await this.metrics.recordFailedReexecution(proposal);
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
  async ensureTransactionsAreAvailable(proposal: BlockProposal): Promise<Tx[]> {
    if (proposal.payload.txHashes.length === 0) {
      this.log.verbose(`Received block proposal with no transactions, skipping transaction availability check`);
      return [];
    }
    // Is this a new style proposal?
    if (proposal.txs && proposal.txs.length > 0 && proposal.txs.length === proposal.payload.txHashes.length) {
      // Yes, any txs that we already have we should use
      this.log.info(`Using new style proposal with ${proposal.txs.length} transactions`);

      // Request from the pool based on the signed hashes in the payload
      const hashesFromPayload = proposal.payload.txHashes;
      const txsToUse = await this.p2pClient.getTxsByHashFromPool(hashesFromPayload);

      const missingTxs = txsToUse.filter(tx => tx === undefined).length;
      if (missingTxs > 0) {
        this.log.verbose(
          `Missing ${missingTxs}/${hashesFromPayload.length} transactions in the tx pool, will attempt to take from the proposal`,
        );
      }

      let usedFromProposal = 0;

      // Fill any holes with txs in the proposal, provided their hash matches the hash in the payload
      for (let i = 0; i < txsToUse.length; i++) {
        if (txsToUse[i] === undefined) {
          // We don't have the transaction, take from the proposal, provided the hash is the same
          const hashOfTxInProposal = await proposal.txs[i].getTxHash();
          if (hashOfTxInProposal.equals(hashesFromPayload[i])) {
            // Hash is equal, we can use the tx from the proposal
            txsToUse[i] = proposal.txs[i];
            usedFromProposal++;
          } else {
            this.log.warn(
              `Unable to take tx: ${hashOfTxInProposal.toString()} from the proposal, it does not match payload hash: ${hashesFromPayload[
                i
              ].toString()}`,
            );
          }
        }
      }

      // See if we still have any holes, if there are then we were not successful and will try the old method
      if (txsToUse.some(tx => tx === undefined)) {
        this.log.warn(`Failed to use transactions from proposal. Falling back to old proposal logic`);
      } else {
        this.log.info(
          `Successfully used ${usedFromProposal}/${hashesFromPayload.length} transactions from the proposal`,
        );
        return txsToUse as Tx[];
      }
    }

    this.log.verbose(`Using old style proposal with ${proposal.payload.txHashes.length} transactions`);

    // Old style proposal, we will perform a request by hash from pool
    // This will request from network any txs that are missing
    const txHashes: TxHash[] = proposal.payload.txHashes;

    // This part is just for logging that we are requesting from the network
    const availability = await this.p2pClient.hasTxsInPool(txHashes);
    const notAvailable = availability.filter(availability => availability === false);
    if (notAvailable.length) {
      this.log.verbose(
        `Missing ${notAvailable.length} transactions in the tx pool, will need to request from the network`,
      );
    }

    // This will request from the network any txs that are missing
    const retrievedTxs = await this.p2pClient.getTxsByHash(txHashes);
    const missingTxs = retrievedTxs
      .map((tx, index) => {
        // Return the hash of any that we did not get
        if (tx === undefined) {
          return txHashes[index];
        } else {
          return undefined;
        }
      })
      .filter(hash => hash !== undefined);
    if (missingTxs.length > 0) {
      throw new TransactionsNotAvailableError(missingTxs as TxHash[]);
    }
    return retrievedTxs as Tx[];
  }

  async createBlockProposal(header: BlockHeader, archive: Fr, txs: Tx[]): Promise<BlockProposal | undefined> {
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
  async collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this block until we have enough attestations
    const slot = proposal.payload.header.globalVariables.slotNumber.toBigInt();
    this.log.debug(`Collecting ${required} attestations for slot ${slot} with deadline ${deadline.toISOString()}`);

    if (+deadline < this.dateProvider.now()) {
      this.log.error(
        `Deadline ${deadline.toISOString()} for collecting ${required} attestations for slot ${slot} is in the past`,
      );
      throw new AttestationTimeoutError(required, slot);
    }

    const proposalId = proposal.archive.toString();
    await this.doAttestToProposal(proposal);
    const me = this.keyStore.getAddress();

    let attestations: BlockAttestation[] = [];
    while (true) {
      const collectedAttestations = await this.p2pClient.getAttestationsForSlot(slot, proposalId);
      const oldSenders = await Promise.all(attestations.map(attestation => attestation.getSender()));
      for (const collected of collectedAttestations) {
        const collectedSender = await collected.getSender();
        if (!collectedSender.equals(me) && !oldSenders.some(sender => sender.equals(collectedSender))) {
          this.log.debug(`Received attestation for slot ${slot} from ${collectedSender.toString()}`);
        }
      }
      attestations = collectedAttestations;

      if (attestations.length >= required) {
        this.log.verbose(`Collected all ${required} attestations for slot ${slot}`);
        return attestations;
      }

      if (+deadline < this.dateProvider.now()) {
        this.log.error(`Timeout ${deadline.toISOString()} waiting for ${required} attestations for slot ${slot}`);
        throw new AttestationTimeoutError(required, slot);
      }

      this.log.debug(`Collected ${attestations.length} attestations so far`);
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }

  private async doAttestToProposal(proposal: BlockProposal): Promise<BlockAttestation> {
    const attestation = await this.validationService.attestToProposal(proposal);
    await this.p2pClient.addAttestation(attestation);
    return attestation;
  }
}

function validatePrivateKey(privateKey: string): Buffer32 {
  try {
    return Buffer32.fromString(privateKey);
  } catch (error) {
    throw new InvalidValidatorPrivateKeyError();
  }
}
