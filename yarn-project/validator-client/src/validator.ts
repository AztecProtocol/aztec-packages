import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, type Timer } from '@aztec/foundation/timer';
import { type P2P, type PeerId, TxCollector } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import type { ProposedBlockHeader, StateReference, Tx } from '@aztec/stdlib/tx';
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
  blockNumber: Fr,
  header: ProposedBlockHeader,
  txs: Iterable<Tx> | AsyncIterableIterator<Tx>,
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
  createBlockProposal(
    blockNumber: Fr,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined>;
  attestToProposal(proposal: BlockProposal, sender: PeerId): Promise<BlockAttestation | undefined>;

  broadcastBlockProposal(proposal: BlockProposal): Promise<void>;
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
  private txCollector: TxCollector;

  constructor(
    private keyStore: ValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private blockSource: L2BlockSource,
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

    this.txCollector = new TxCollector(p2pClient, this.log);

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.myAddress = this.keyStore.getAddress();
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), log, 1000);

    this.log.verbose(`Initialized validator with address ${this.keyStore.getAddress().toString()}`);
  }

  private async handleEpochCommitteeUpdate() {
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
    blockSource: L2BlockSource,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    if (!config.validatorPrivateKey) {
      throw new InvalidValidatorPrivateKeyError();
    }

    const privateKey = validatePrivateKey(config.validatorPrivateKey);
    const localKeyStore = new LocalKeyStore(privateKey);

    const validator = new ValidatorClient(
      localKeyStore,
      epochCache,
      p2pClient,
      blockSource,
      config,
      dateProvider,
      telemetry,
    );
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
    const handler = (block: BlockProposal, proposalSender: any): Promise<BlockAttestation | undefined> => {
      return this.attestToProposal(block, proposalSender);
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

  async attestToProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation | undefined> {
    const slotNumber = proposal.slotNumber.toNumber();
    const blockNumber = proposal.blockNumber.toNumber();
    const proposalInfo = {
      slotNumber,
      blockNumber,
      archive: proposal.payload.archive.toString(),
      txCount: proposal.payload.txHashes.length,
      txHashes: proposal.payload.txHashes.map(txHash => txHash.toString()),
    };
    this.log.verbose(`Received request to attest for slot ${slotNumber}`);

    // Check that the proposal is from the current proposer, or the next proposer.
    // Q: Should this be moved to the block proposal validator, so we disregard proposals from anyone?
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.verbose(`Proposal is not valid, skipping attestation`);
      this.metrics.incFailedAttestations('invalid_proposal');
      return undefined;
    }

    // Check that the parent proposal is a block we know, otherwise reexecution would fail.
    // Q: Should we move this to the block proposal validator? If there, then p2p would check it
    // before re-broadcasting it. This means that proposals built on top of an L1-reorgd-out block
    // would not be rebroadcasted. But it also means that nodes that have not fully synced would
    // not rebroadcast the proposal.
    if (blockNumber > INITIAL_L2_BLOCK_NUM) {
      const parentBlock = await this.blockSource.getBlock(blockNumber - 1);
      if (parentBlock === undefined) {
        this.log.verbose(`Parent block for ${blockNumber} not found, skipping attestation`);
        this.metrics.incFailedAttestations('parent_block_not_found');
        return undefined;
      }
      if (!proposal.payload.header.lastArchiveRoot.equals(parentBlock.archive.root)) {
        this.log.verbose(`Parent block archive root for proposal does not match, skipping attestation`, {
          proposalLastArchiveRoot: proposal.payload.header.lastArchiveRoot.toString(),
          parentBlockArchiveRoot: parentBlock.archive.root.toString(),
          ...proposalInfo,
        });
        this.metrics.incFailedAttestations('parent_block_does_not_match');
        return undefined;
      }
    }

    // Collect txs from the proposal
    const { missing, txs } = await this.txCollector.collectForBlockProposal(proposal, proposalSender);

    // Check that I am in the committee before attesting
    if (!(await this.epochCache.isInCommittee(this.keyStore.getAddress()))) {
      this.log.verbose(`Not in the committee, skipping attestation`);
      return undefined;
    }

    // Check that all of the transactions in the proposal are available in the tx pool before attesting
    if (missing && missing.length > 0) {
      this.log.error(
        `Missing ${missing.length}/${proposal.payload.txHashes.length} txs to attest to proposal`,
        undefined,
        { proposalInfo, missing },
      );
      this.metrics.incFailedAttestations('TransactionsNotAvailableError');
      return undefined;
    }

    // Try re-executing the transactions in the proposal
    try {
      this.log.verbose(`Processing attestation for slot ${slotNumber}`, proposalInfo);
      if (this.config.validatorReexecute) {
        this.log.verbose(`Re-executing transactions in the proposal before attesting`);
        await this.reExecuteTransactions(proposal, txs);
      }
    } catch (error: any) {
      this.metrics.incFailedAttestations(error instanceof Error ? error.name : 'unknown');
      this.log.error(`Failed to attest to proposal`, error, proposalInfo);
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(`Attesting to proposal for slot ${slotNumber}`, proposalInfo);
    this.metrics.incAttestations();
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
      const foundTxHashes = await Promise.all(txs.map(async tx => await tx.getTxHash()));
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.includes(txHash));
      throw new TransactionsNotAvailableError(missingTxHashes);
    }

    // Assertion: This check will fail if re-execution is not enabled
    if (this.blockBuilder === undefined) {
      throw new BlockBuilderNotProvidedError();
    }

    // Use the sequencer's block building logic to re-execute the transactions
    const stopTimer = this.metrics.reExecutionTimer();
    const { block, numFailedTxs } = await this.blockBuilder(proposal.blockNumber, header, txs, {
      validateOnly: true,
    });
    stopTimer();

    this.log.verbose(`Transaction re-execution complete`);

    if (numFailedTxs > 0) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExFailedTxsError(numFailedTxs);
    }

    if (block.body.txEffects.length !== txHashes.length) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExTimeoutError();
    }

    // This function will throw an error if state updates do not match
    if (!block.archive.root.equals(proposal.archive)) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExStateMismatchError();
    }
  }

  async createBlockProposal(
    blockNumber: Fr,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined> {
    if (this.previousProposal?.slotNumber.equals(header.slotNumber)) {
      this.log.verbose(`Already made a proposal for the same slot, skipping proposal`);
      return Promise.resolve(undefined);
    }

    const newProposal = await this.validationService.createBlockProposal(
      blockNumber,
      header,
      archive,
      stateReference,
      txs,
      options,
    );
    this.previousProposal = newProposal;
    return newProposal;
  }

  async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
    await this.p2pClient.broadcastProposal(proposal);
  }

  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7962)
  async collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this block until we have enough attestations
    const slot = proposal.payload.header.slotNumber.toBigInt();
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
      const oldSenders = attestations.map(attestation => attestation.getSender());
      for (const collected of collectedAttestations) {
        const collectedSender = collected.getSender();
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
  } catch {
    throw new InvalidValidatorPrivateKeyError();
  }
}
