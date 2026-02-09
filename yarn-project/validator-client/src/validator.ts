import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, getBlobsPerL1Block } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { type LogData, type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { DuplicateAttestationInfo, DuplicateProposalInfo, P2P, PeerId } from '@aztec/p2p';
import { AuthRequest, AuthResponse, BlockProposalValidator, ReqRespSubProtocol } from '@aztec/p2p';
import { OffenseType, WANT_TO_SLASH_EVENT, type Watcher, type WatcherEmitter } from '@aztec/slasher';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CommitteeAttestationsAndSigners, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type {
  CreateCheckpointProposalLastBlockData,
  ITxProvider,
  Validator,
  ValidatorClientFullConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import {
  type BlockProposal,
  type BlockProposalOptions,
  type CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type CheckpointProposalOptions,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, CheckpointGlobalVariables, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';
import { createHASigner } from '@aztec/validator-ha-signer/factory';
import { DutyType, type SigningContext } from '@aztec/validator-ha-signer/types';

import { EventEmitter } from 'events';
import type { TypedDataDefinition } from 'viem';

import { BlockProposalHandler, type BlockProposalValidationFailureReason } from './block_proposal_handler.js';
import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { ValidationService } from './duties/validation_service.js';
import { HAKeyStore } from './key_store/ha_key_store.js';
import type { ExtendedValidatorKeyStore } from './key_store/interface.js';
import { NodeKeystoreAdapter } from './key_store/node_keystore_adapter.js';
import { ValidatorMetrics } from './metrics.js';

// We maintain a set of proposers who have proposed invalid blocks.
// Just cap the set to avoid unbounded growth.
const MAX_PROPOSERS_OF_INVALID_BLOCKS = 1000;

// What errors from the block proposal handler result in slashing
const SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT: BlockProposalValidationFailureReason[] = [
  'state_mismatch',
  'failed_txs',
];

/**
 * Validator Client
 */
export class ValidatorClient extends (EventEmitter as new () => WatcherEmitter) implements Validator, Watcher {
  public readonly tracer: Tracer;
  private validationService: ValidationService;
  private metrics: ValidatorMetrics;
  private log: Logger;

  // Whether it has already registered handlers on the p2p client
  private hasRegisteredHandlers = false;

  /** Tracks the last block proposal we created, to detect duplicate proposal attempts. */
  private lastProposedBlock?: BlockProposal;

  /** Tracks the last checkpoint proposal we created. */
  private lastProposedCheckpoint?: CheckpointProposal;

  private lastEpochForCommitteeUpdateLoop: EpochNumber | undefined;
  private epochCacheUpdateLoop: RunningPromise;

  private proposersOfInvalidBlocks: Set<string> = new Set();

  /** Tracks the last checkpoint proposal we attested to, to prevent equivocation. */
  private lastAttestedProposal?: CheckpointProposalCore;

  protected constructor(
    private keyStore: ExtendedValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private blockProposalHandler: BlockProposalHandler,
    private blockSource: L2BlockSource,
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private worldState: WorldStateSynchronizer,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private config: ValidatorClientFullConfig,
    private blobClient: BlobClientInterface,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    log = createLogger('validator'),
  ) {
    super();

    // Create child logger with fisherman prefix if in fisherman mode
    this.log = config.fishermanMode ? log.createChild('[FISHERMAN]') : log;

    this.tracer = telemetry.getTracer('Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore, this.log.createChild('validation-service'));

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), this.log, 1000);

    const myAddresses = this.getValidatorAddresses();
    this.log.verbose(`Initialized validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
  }

  public static validateKeyStoreConfiguration(keyStoreManager: KeystoreManager, logger?: Logger) {
    const validatorKeyStore = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);
    const validatorAddresses = validatorKeyStore.getAddresses();
    // Verify that we can retrieve all required data from the key store
    for (const address of validatorAddresses) {
      // Functions throw if required data is not available
      let coinbase: EthAddress;
      let feeRecipient: AztecAddress;
      try {
        coinbase = validatorKeyStore.getCoinbaseAddress(address);
        feeRecipient = validatorKeyStore.getFeeRecipient(address);
      } catch (error) {
        throw new Error(`Failed to retrieve required data for validator address ${address}, error: ${error}`);
      }

      const publisherAddresses = validatorKeyStore.getPublisherAddresses(address);
      if (!publisherAddresses.length) {
        throw new Error(`No publisher addresses found for validator address ${address}`);
      }
      logger?.debug(
        `Validator ${address.toString()} configured with coinbase ${coinbase.toString()}, feeRecipient ${feeRecipient.toString()} and publishers ${publisherAddresses.map(x => x.toString()).join()}`,
      );
    }
  }

  private async handleEpochCommitteeUpdate() {
    try {
      const { committee, epoch } = await this.epochCache.getCommittee('next');
      if (!committee) {
        this.log.trace(`No committee found for slot`);
        return;
      }
      if (epoch !== this.lastEpochForCommitteeUpdateLoop) {
        const me = this.getValidatorAddresses();
        const committeeSet = new Set(committee.map(v => v.toString()));
        const inCommittee = me.filter(a => committeeSet.has(a.toString()));
        if (inCommittee.length > 0) {
          this.log.info(
            `Validators ${inCommittee.map(a => a.toString()).join(',')} are on the validator committee for epoch ${epoch}`,
          );
        } else {
          this.log.verbose(
            `Validators ${me.map(a => a.toString()).join(', ')} are not on the validator committee for epoch ${epoch}`,
          );
        }
        this.lastEpochForCommitteeUpdateLoop = epoch;
      }
    } catch (err) {
      this.log.error(`Error updating epoch committee`, err);
    }
  }

  static async new(
    config: ValidatorClientFullConfig,
    checkpointsBuilder: FullNodeCheckpointsBuilder,
    worldState: WorldStateSynchronizer,
    epochCache: EpochCache,
    p2pClient: P2P,
    blockSource: L2BlockSource & L2BlockSink,
    l1ToL2MessageSource: L1ToL2MessageSource,
    txProvider: ITxProvider,
    keyStoreManager: KeystoreManager,
    blobClient: BlobClientInterface,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const metrics = new ValidatorMetrics(telemetry);
    const blockProposalValidator = new BlockProposalValidator(epochCache, {
      txsPermitted: !config.disableTransactions,
    });
    const blockProposalHandler = new BlockProposalHandler(
      checkpointsBuilder,
      worldState,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      blockProposalValidator,
      epochCache,
      config,
      metrics,
      dateProvider,
      telemetry,
    );

    let validatorKeyStore: ExtendedValidatorKeyStore = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);
    if (config.haSigningEnabled) {
      // If maxStuckDutiesAgeMs is not explicitly set, compute it from Aztec slot duration
      const haConfig = {
        ...config,
        maxStuckDutiesAgeMs: config.maxStuckDutiesAgeMs ?? epochCache.getL1Constants().slotDuration * 2 * 1000,
      };
      const { signer } = await createHASigner(haConfig);
      validatorKeyStore = new HAKeyStore(validatorKeyStore, signer);
    }

    const validator = new ValidatorClient(
      validatorKeyStore,
      epochCache,
      p2pClient,
      blockProposalHandler,
      blockSource,
      checkpointsBuilder,
      worldState,
      l1ToL2MessageSource,
      config,
      blobClient,
      dateProvider,
      telemetry,
    );

    return validator;
  }

  public getValidatorAddresses() {
    return this.keyStore
      .getAddresses()
      .filter(addr => !this.config.disabledValidators.some(disabled => disabled.equals(addr)));
  }

  public getBlockProposalHandler() {
    return this.blockProposalHandler;
  }

  public signWithAddress(addr: EthAddress, msg: TypedDataDefinition, context: SigningContext) {
    return this.keyStore.signTypedDataWithAddress(addr, msg, context);
  }

  public getCoinbaseForAttestor(attestor: EthAddress): EthAddress {
    return this.keyStore.getCoinbaseAddress(attestor);
  }

  public getFeeRecipientForAttestor(attestor: EthAddress): AztecAddress {
    return this.keyStore.getFeeRecipient(attestor);
  }

  public getConfig(): ValidatorClientFullConfig {
    return this.config;
  }

  public updateConfig(config: Partial<ValidatorClientFullConfig>) {
    this.config = { ...this.config, ...config };
  }

  public async start() {
    if (this.epochCacheUpdateLoop.isRunning()) {
      this.log.warn(`Validator client already started`);
      return;
    }

    await this.keyStore.start();

    await this.registerHandlers();

    const myAddresses = this.getValidatorAddresses();
    const inCommittee = await this.epochCache.filterInCommittee('now', myAddresses);
    this.log.info(`Started validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
    if (inCommittee.length > 0) {
      this.log.info(`Addresses in current validator committee: ${inCommittee.map(a => a.toString()).join(', ')}`);
    }
    this.epochCacheUpdateLoop.start();

    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
    await this.keyStore.stop();
  }

  /** Register handlers on the p2p client */
  public async registerHandlers() {
    if (!this.hasRegisteredHandlers) {
      this.hasRegisteredHandlers = true;
      this.log.debug(`Registering validator handlers for p2p client`);

      // Block proposal handler - validates but does NOT attest (validators only attest to checkpoints)
      const blockHandler = (block: BlockProposal, proposalSender: PeerId): Promise<boolean> =>
        this.validateBlockProposal(block, proposalSender);
      this.p2pClient.registerBlockProposalHandler(blockHandler);

      // Checkpoint proposal handler - validates and creates attestations
      // The checkpoint is received as CheckpointProposalCore since the lastBlock is extracted
      // and processed separately via the block handler above.
      const checkpointHandler = (
        checkpoint: CheckpointProposalCore,
        proposalSender: PeerId,
      ): Promise<CheckpointAttestation[] | undefined> => this.attestToCheckpointProposal(checkpoint, proposalSender);
      this.p2pClient.registerCheckpointProposalHandler(checkpointHandler);

      // Duplicate proposal handler - triggers slashing for equivocation
      this.p2pClient.registerDuplicateProposalCallback((info: DuplicateProposalInfo) => {
        this.handleDuplicateProposal(info);
      });

      // Duplicate attestation handler - triggers slashing for attestation equivocation
      this.p2pClient.registerDuplicateAttestationCallback((info: DuplicateAttestationInfo) => {
        this.handleDuplicateAttestation(info);
      });

      const myAddresses = this.getValidatorAddresses();
      this.p2pClient.registerThisValidatorAddresses(myAddresses);

      await this.p2pClient.addReqRespSubProtocol(ReqRespSubProtocol.AUTH, this.handleAuthRequest.bind(this));
    }
  }

  /**
   * Validate a block proposal from a peer.
   * Note: Validators do NOT attest to individual blocks - attestations are only for checkpoint proposals.
   * @returns true if the proposal is valid, false otherwise
   */
  async validateBlockProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<boolean> {
    const slotNumber = proposal.slotNumber;

    // Note: During escape hatch, we still want to "validate" proposals for observability,
    // but we intentionally reject them and disable slashing invalid block and attestation flow.
    const escapeHatchOpen = await this.epochCache.isEscapeHatchOpenAtSlot(slotNumber);

    const proposer = proposal.getSender();

    // Reject proposals with invalid signatures
    if (!proposer) {
      this.log.warn(`Received block proposal with invalid signature for slot ${slotNumber}`);
      return false;
    }

    // Check if we're in the committee (for metrics purposes)
    const inCommittee = await this.epochCache.filterInCommittee(slotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;

    const proposalInfo = { ...proposal.toBlockInfo(), proposer: proposer.toString() };
    this.log.info(`Received block proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
      fishermanMode: this.config.fishermanMode || false,
    });

    // Reexecute txs if we are part of the committee, or if slashing is enabled, or if we are configured to always reexecute.
    // In fisherman mode, we always reexecute to validate proposals.
    const { validatorReexecute, slashBroadcastedInvalidBlockPenalty, alwaysReexecuteBlockProposals, fishermanMode } =
      this.config;
    const shouldReexecute =
      fishermanMode ||
      (slashBroadcastedInvalidBlockPenalty > 0n && validatorReexecute) ||
      (partOfCommittee && validatorReexecute) ||
      alwaysReexecuteBlockProposals ||
      this.blobClient.canUpload();

    const validationResult = await this.blockProposalHandler.handleBlockProposal(
      proposal,
      proposalSender,
      !!shouldReexecute && !escapeHatchOpen,
    );

    if (!validationResult.isValid) {
      this.log.warn(`Block proposal validation failed: ${validationResult.reason}`, proposalInfo);

      const reason = validationResult.reason || 'unknown';
      // Classify failure reason: bad proposal vs node issue
      const badProposalReasons: BlockProposalValidationFailureReason[] = [
        'invalid_proposal',
        'state_mismatch',
        'failed_txs',
        'in_hash_mismatch',
        'parent_block_wrong_slot',
      ];

      if (badProposalReasons.includes(reason as BlockProposalValidationFailureReason)) {
        this.metrics.incFailedAttestationsBadProposal(1, reason, partOfCommittee);
      } else {
        // Node issues so we can't validate
        this.metrics.incFailedAttestationsNodeIssue(1, reason, partOfCommittee);
      }

      // Slash invalid block proposals (can happen even when not in committee)
      if (
        !escapeHatchOpen &&
        validationResult.reason &&
        SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT.includes(validationResult.reason) &&
        slashBroadcastedInvalidBlockPenalty > 0n
      ) {
        this.log.warn(`Slashing proposer for invalid block proposal`, proposalInfo);
        this.slashInvalidBlock(proposal);
      }
      return false;
    }

    this.log.info(`Validated block proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      inCommittee: partOfCommittee,
      fishermanMode: this.config.fishermanMode || false,
      escapeHatchOpen,
    });

    if (escapeHatchOpen) {
      this.log.warn(`Escape hatch open for slot ${slotNumber}, rejecting block proposal`, proposalInfo);
      return false;
    }

    return true;
  }

  /**
   * Validate and attest to a checkpoint proposal from a peer.
   * The proposal is received as CheckpointProposalCore (without lastBlock) since
   * the lastBlock is extracted and processed separately via the block handler.
   * @returns Checkpoint attestations if valid, undefined otherwise
   */
  async attestToCheckpointProposal(
    proposal: CheckpointProposalCore,
    _proposalSender: PeerId,
  ): Promise<CheckpointAttestation[] | undefined> {
    const slotNumber = proposal.slotNumber;
    const proposer = proposal.getSender();

    // If escape hatch is open for this slot's epoch, do not attest.
    if (await this.epochCache.isEscapeHatchOpenAtSlot(slotNumber)) {
      this.log.warn(`Escape hatch open for slot ${slotNumber}, skipping checkpoint attestation handling`);
      return undefined;
    }

    // Reject proposals with invalid signatures
    if (!proposer) {
      this.log.warn(`Received checkpoint proposal with invalid signature for slot ${slotNumber}`);
      return undefined;
    }

    // Check that I have any address in current committee before attesting
    const inCommittee = await this.epochCache.filterInCommittee(slotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;

    const proposalInfo = {
      slotNumber,
      archive: proposal.archive.toString(),
      proposer: proposer.toString(),
      txCount: proposal.txHashes.length,
    };
    this.log.info(`Received checkpoint proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
      fishermanMode: this.config.fishermanMode || false,
    });

    // Validate the checkpoint proposal before attesting (unless skipCheckpointProposalValidation is set)
    if (this.config.skipCheckpointProposalValidation) {
      this.log.warn(`Skipping checkpoint proposal validation for slot ${slotNumber}`, proposalInfo);
    } else {
      const validationResult = await this.validateCheckpointProposal(proposal, proposalInfo);
      if (!validationResult.isValid) {
        this.log.warn(`Checkpoint proposal validation failed: ${validationResult.reason}`, proposalInfo);
        return undefined;
      }
    }

    // Upload blobs to filestore if we can (fire and forget)
    if (this.blobClient.canUpload()) {
      void this.uploadBlobsForCheckpoint(proposal, proposalInfo);
    }

    // Check that I have any address in current committee before attesting
    // In fisherman mode, we still create attestations for validation even if not in committee
    if (!partOfCommittee && !this.config.fishermanMode) {
      this.log.verbose(`No validator in the current committee, skipping attestation`, proposalInfo);
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(`${partOfCommittee ? 'Attesting to' : 'Validated'} checkpoint proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      inCommittee: partOfCommittee,
      fishermanMode: this.config.fishermanMode || false,
    });

    this.metrics.incSuccessfulAttestations(inCommittee.length);

    // Determine which validators should attest
    let attestors: EthAddress[];
    if (partOfCommittee) {
      attestors = inCommittee;
    } else if (this.config.fishermanMode) {
      // In fisherman mode, create attestations for validation purposes even if not in committee. These won't be broadcast.
      attestors = this.getValidatorAddresses();
    } else {
      attestors = [];
    }

    // Only create attestations if we have attestors
    if (attestors.length === 0) {
      return undefined;
    }

    if (this.config.fishermanMode) {
      // bail out early and don't save attestations to the pool in fisherman mode
      this.log.info(`Creating checkpoint attestations for slot ${slotNumber}`, {
        ...proposalInfo,
        attestors: attestors.map(a => a.toString()),
      });
      return undefined;
    }

    return await this.createCheckpointAttestationsFromProposal(proposal, attestors);
  }

  /**
   * Checks if we should attest to a slot based on equivocation prevention rules.
   * @returns true if we should attest, false if we should skip
   */
  private shouldAttestToSlot(slotNumber: SlotNumber): boolean {
    // If attestToEquivocatedProposals is true, always allow
    if (this.config.attestToEquivocatedProposals) {
      return true;
    }

    // Check if incoming slot is strictly greater than last attested
    if (this.lastAttestedProposal && slotNumber <= this.lastAttestedProposal.slotNumber) {
      this.log.warn(
        `Refusing to process a proposal for slot ${slotNumber} given we already attested to a proposal for slot ${this.lastAttestedProposal.slotNumber}`,
      );
      return false;
    }

    return true;
  }

  private async createCheckpointAttestationsFromProposal(
    proposal: CheckpointProposalCore,
    attestors: EthAddress[] = [],
  ): Promise<CheckpointAttestation[] | undefined> {
    // Equivocation check: must happen right before signing to minimize the race window
    if (!this.shouldAttestToSlot(proposal.slotNumber)) {
      return undefined;
    }

    const attestations = await this.validationService.attestToCheckpointProposal(proposal, attestors);

    // Track the proposal we attested to (to prevent equivocation)
    this.lastAttestedProposal = proposal;

    await this.p2pClient.addOwnCheckpointAttestations(attestations);
    return attestations;
  }

  /**
   * Validates a checkpoint proposal by building the full checkpoint and comparing it with the proposal.
   * @returns Validation result with isValid flag and reason if invalid.
   */
  private async validateCheckpointProposal(
    proposal: CheckpointProposalCore,
    proposalInfo: LogData,
  ): Promise<{ isValid: true } | { isValid: false; reason: string }> {
    const slot = proposal.slotNumber;
    const timeoutSeconds = 10; // TODO(palla/mbps): This should map to the timetable settings

    // Wait for last block to sync by archive
    let lastBlockHeader: BlockHeader | undefined;
    try {
      lastBlockHeader = await retryUntil(
        async () => {
          await this.blockSource.syncImmediate();
          return this.blockSource.getBlockHeaderByArchive(proposal.archive);
        },
        `waiting for block with archive ${proposal.archive.toString()} for slot ${slot}`,
        timeoutSeconds,
        0.5,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        this.log.warn(`Timed out waiting for block with archive matching checkpoint proposal`, proposalInfo);
        return { isValid: false, reason: 'last_block_not_found' };
      }
      this.log.error(`Error fetching last block for checkpoint proposal`, err, proposalInfo);
      return { isValid: false, reason: 'block_fetch_error' };
    }

    if (!lastBlockHeader) {
      this.log.warn(`Last block not found for checkpoint proposal`, proposalInfo);
      return { isValid: false, reason: 'last_block_not_found' };
    }

    // Get all full blocks for the slot and checkpoint
    const blocks = await this.blockSource.getBlocksForSlot(slot);
    if (blocks.length === 0) {
      this.log.warn(`No blocks found for slot ${slot}`, proposalInfo);
      return { isValid: false, reason: 'no_blocks_for_slot' };
    }

    this.log.debug(`Found ${blocks.length} blocks for slot ${slot}`, {
      ...proposalInfo,
      blockNumbers: blocks.map(b => b.number),
    });

    // Get checkpoint constants from first block
    const firstBlock = blocks[0];
    const constants = this.extractCheckpointConstants(firstBlock);
    const checkpointNumber = firstBlock.checkpointNumber;

    // Get L1-to-L2 messages for this checkpoint
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpointNumber);

    // Compute the previous checkpoint out hashes for the epoch.
    // TODO: There can be a more efficient way to get the previous checkpoint out hashes without having to fetch the
    // actual checkpoints and the blocks/txs in them.
    const epoch = getEpochAtSlot(slot, this.epochCache.getL1Constants());
    const previousCheckpoints = (await this.blockSource.getCheckpointsForEpoch(epoch))
      .filter(b => b.number < checkpointNumber)
      .sort((a, b) => a.number - b.number);
    const previousCheckpointOutHashes = previousCheckpoints.map(c => c.getCheckpointOutHash());

    // Fork world state at the block before the first block
    const parentBlockNumber = BlockNumber(firstBlock.number - 1);
    const fork = await this.worldState.fork(parentBlockNumber);

    try {
      // Create checkpoint builder with all existing blocks
      const checkpointBuilder = await this.checkpointsBuilder.openCheckpoint(
        checkpointNumber,
        constants,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
        blocks,
        this.log.getBindings(),
      );

      // Complete the checkpoint to get computed values
      const computedCheckpoint = await checkpointBuilder.completeCheckpoint();

      // Compare checkpoint header with proposal
      if (!computedCheckpoint.header.equals(proposal.checkpointHeader)) {
        this.log.warn(`Checkpoint header mismatch`, {
          ...proposalInfo,
          computed: computedCheckpoint.header.toInspect(),
          proposal: proposal.checkpointHeader.toInspect(),
        });
        return { isValid: false, reason: 'checkpoint_header_mismatch' };
      }

      // Compare archive root with proposal
      if (!computedCheckpoint.archive.root.equals(proposal.archive)) {
        this.log.warn(`Archive root mismatch`, {
          ...proposalInfo,
          computed: computedCheckpoint.archive.root.toString(),
          proposal: proposal.archive.toString(),
        });
        return { isValid: false, reason: 'archive_mismatch' };
      }

      // Check that the accumulated epoch out hash matches the value in the proposal.
      // The epoch out hash is the accumulated hash of all checkpoint out hashes in the epoch.
      const checkpointOutHash = computedCheckpoint.getCheckpointOutHash();
      const computedEpochOutHash = accumulateCheckpointOutHashes([...previousCheckpointOutHashes, checkpointOutHash]);
      const proposalEpochOutHash = proposal.checkpointHeader.epochOutHash;
      if (!computedEpochOutHash.equals(proposalEpochOutHash)) {
        this.log.warn(`Epoch out hash mismatch`, {
          proposalEpochOutHash: proposalEpochOutHash.toString(),
          computedEpochOutHash: computedEpochOutHash.toString(),
          checkpointOutHash: checkpointOutHash.toString(),
          previousCheckpointOutHashes: previousCheckpointOutHashes.map(h => h.toString()),
          ...proposalInfo,
        });
        return { isValid: false, reason: 'out_hash_mismatch' };
      }

      this.log.verbose(`Checkpoint proposal validation successful for slot ${slot}`, proposalInfo);
      return { isValid: true };
    } finally {
      await fork.close();
    }
  }

  /**
   * Extract checkpoint global variables from a block.
   */
  private extractCheckpointConstants(block: L2Block): CheckpointGlobalVariables {
    const gv = block.header.globalVariables;
    return {
      chainId: gv.chainId,
      version: gv.version,
      slotNumber: gv.slotNumber,
      coinbase: gv.coinbase,
      feeRecipient: gv.feeRecipient,
      gasFees: gv.gasFees,
    };
  }

  /**
   * Uploads blobs for a checkpoint to the filestore (fire and forget).
   */
  private async uploadBlobsForCheckpoint(proposal: CheckpointProposalCore, proposalInfo: LogData): Promise<void> {
    try {
      const lastBlockHeader = await this.blockSource.getBlockHeaderByArchive(proposal.archive);
      if (!lastBlockHeader) {
        this.log.warn(`Failed to get last block header for blob upload`, proposalInfo);
        return;
      }

      const blocks = await this.blockSource.getBlocksForSlot(proposal.slotNumber);
      if (blocks.length === 0) {
        this.log.warn(`No blocks found for blob upload`, proposalInfo);
        return;
      }

      const blobFields = blocks.flatMap(b => b.toBlobFields());
      const blobs: Blob[] = getBlobsPerL1Block(blobFields);
      await this.blobClient.sendBlobsToFilestore(blobs);
      this.log.debug(`Uploaded ${blobs.length} blobs to filestore for checkpoint at slot ${proposal.slotNumber}`, {
        ...proposalInfo,
        numBlobs: blobs.length,
      });
    } catch (err) {
      this.log.warn(`Failed to upload blobs for checkpoint: ${err}`, proposalInfo);
    }
  }

  private slashInvalidBlock(proposal: BlockProposal) {
    const proposer = proposal.getSender();

    // Skip if signature is invalid (shouldn't happen since we validate earlier)
    if (!proposer) {
      this.log.warn(`Cannot slash proposal with invalid signature`);
      return;
    }

    // Trim the set if it's too big.
    if (this.proposersOfInvalidBlocks.size > MAX_PROPOSERS_OF_INVALID_BLOCKS) {
      // remove oldest proposer. `values` is guaranteed to be in insertion order.
      this.proposersOfInvalidBlocks.delete(this.proposersOfInvalidBlocks.values().next().value!);
    }

    this.proposersOfInvalidBlocks.add(proposer.toString());

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashBroadcastedInvalidBlockPenalty,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: BigInt(proposal.slotNumber),
      },
    ]);
  }

  /**
   * Handle detection of a duplicate proposal (equivocation).
   * Emits a slash event when a proposer sends multiple proposals for the same position.
   */
  private handleDuplicateProposal(info: DuplicateProposalInfo): void {
    const { slot, proposer, type } = info;

    this.log.warn(`Triggering slash event for duplicate ${type} proposal from ${proposer.toString()} at slot ${slot}`, {
      proposer: proposer.toString(),
      slot,
      type,
    });

    // Emit slash event
    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashDuplicateProposalPenalty,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: BigInt(slot),
      },
    ]);
  }

  /**
   * Handle detection of a duplicate attestation (equivocation).
   * Emits a slash event when an attester signs attestations for different proposals at the same slot.
   */
  private handleDuplicateAttestation(info: DuplicateAttestationInfo): void {
    const { slot, attester } = info;

    this.log.warn(`Triggering slash event for duplicate attestation from ${attester.toString()} at slot ${slot}`, {
      attester: attester.toString(),
      slot,
    });

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: attester,
        amount: this.config.slashDuplicateAttestationPenalty,
        offenseType: OffenseType.DUPLICATE_ATTESTATION,
        epochOrSlot: BigInt(slot),
      },
    ]);
  }

  async createBlockProposal(
    blockHeader: BlockHeader,
    indexWithinCheckpoint: IndexWithinCheckpoint,
    inHash: Fr,
    archive: Fr,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions = {},
  ): Promise<BlockProposal> {
    // Validate that we're not creating a proposal for an older or equal position
    if (this.lastProposedBlock) {
      const lastSlot = this.lastProposedBlock.slotNumber;
      const lastIndex = this.lastProposedBlock.indexWithinCheckpoint;
      const newSlot = blockHeader.globalVariables.slotNumber;

      if (newSlot < lastSlot || (newSlot === lastSlot && indexWithinCheckpoint <= lastIndex)) {
        throw new Error(
          `Cannot create block proposal for slot ${newSlot} index ${indexWithinCheckpoint}: ` +
            `already proposed block for slot ${lastSlot} index ${lastIndex}`,
        );
      }
    }

    this.log.info(
      `Assembling block proposal for block ${blockHeader.globalVariables.blockNumber} slot ${blockHeader.globalVariables.slotNumber}`,
    );
    const newProposal = await this.validationService.createBlockProposal(
      blockHeader,
      indexWithinCheckpoint,
      inHash,
      archive,
      txs,
      proposerAddress,
      {
        ...options,
        broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
      },
    );
    this.lastProposedBlock = newProposal;
    return newProposal;
  }

  async createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    lastBlockInfo: CreateCheckpointProposalLastBlockData | undefined,
    proposerAddress: EthAddress | undefined,
    options: CheckpointProposalOptions = {},
  ): Promise<CheckpointProposal> {
    // Validate that we're not creating a proposal for an older or equal slot
    if (this.lastProposedCheckpoint) {
      const lastSlot = this.lastProposedCheckpoint.slotNumber;
      const newSlot = checkpointHeader.slotNumber;

      if (newSlot <= lastSlot) {
        throw new Error(
          `Cannot create checkpoint proposal for slot ${newSlot}: ` +
            `already proposed checkpoint for slot ${lastSlot}`,
        );
      }
    }

    this.log.info(`Assembling checkpoint proposal for slot ${checkpointHeader.slotNumber}`);
    const newProposal = await this.validationService.createCheckpointProposal(
      checkpointHeader,
      archive,
      lastBlockInfo,
      proposerAddress,
      options,
    );
    this.lastProposedCheckpoint = newProposal;
    return newProposal;
  }

  async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
    await this.p2pClient.broadcastProposal(proposal);
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    blockNumber: BlockNumber | CheckpointNumber,
  ): Promise<Signature> {
    return await this.validationService.signAttestationsAndSigners(attestationsAndSigners, proposer, slot, blockNumber);
  }

  async collectOwnAttestations(proposal: CheckpointProposal): Promise<CheckpointAttestation[]> {
    const slot = proposal.slotNumber;
    const inCommittee = await this.epochCache.filterInCommittee(slot, this.getValidatorAddresses());
    this.log.debug(`Collecting ${inCommittee.length} self-attestations for slot ${slot}`, { inCommittee });
    const attestations = await this.createCheckpointAttestationsFromProposal(proposal, inCommittee);

    if (!attestations) {
      return [];
    }

    // We broadcast our own attestations to our peers so, in case our block does not get mined on L1,
    // other nodes can see that our validators did attest to this block proposal, and do not slash us
    // due to inactivity for missed attestations.
    void this.p2pClient.broadcastCheckpointAttestations(attestations).catch(err => {
      this.log.error(`Failed to broadcast self-attestations for slot ${slot}`, err);
    });
    return attestations;
  }

  async collectAttestations(
    proposal: CheckpointProposal,
    required: number,
    deadline: Date,
  ): Promise<CheckpointAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this checkpoint until we have enough attestations
    const slot = proposal.slotNumber;
    this.log.debug(`Collecting ${required} attestations for slot ${slot} with deadline ${deadline.toISOString()}`);

    if (+deadline < this.dateProvider.now()) {
      this.log.error(
        `Deadline ${deadline.toISOString()} for collecting ${required} attestations for slot ${slot} is in the past`,
      );
      throw new AttestationTimeoutError(0, required, slot);
    }

    await this.collectOwnAttestations(proposal);

    const proposalId = proposal.archive.toString();
    const myAddresses = this.getValidatorAddresses();

    let attestations: CheckpointAttestation[] = [];
    while (true) {
      // Filter out attestations with a mismatching archive. This should NOT happen since we have verified
      // the proposer signature (ie our own) before accepting the attestation into the pool via the p2p client.
      const collectedAttestations = (await this.p2pClient.getCheckpointAttestationsForSlot(slot, proposalId)).filter(
        attestation => {
          if (!attestation.archive.equals(proposal.archive)) {
            this.log.warn(
              `Received attestation for slot ${slot} with mismatched archive from ${attestation.getSender()?.toString()}`,
              { attestationArchive: attestation.archive.toString(), proposalArchive: proposal.archive.toString() },
            );
            return false;
          }
          return true;
        },
      );

      // Log new attestations we collected
      const oldSenders = attestations.map(attestation => attestation.getSender());
      for (const collected of collectedAttestations) {
        const collectedSender = collected.getSender();
        // Skip attestations with invalid signatures
        if (!collectedSender) {
          this.log.warn(`Skipping attestation with invalid signature for slot ${slot}`);
          continue;
        }
        if (
          !myAddresses.some(address => address.equals(collectedSender)) &&
          !oldSenders.some(sender => sender?.equals(collectedSender))
        ) {
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
        throw new AttestationTimeoutError(attestations.length, required, slot);
      }

      this.log.debug(`Collected ${attestations.length} of ${required} attestations so far`);
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }

  private async handleAuthRequest(peer: PeerId, msg: Buffer): Promise<Buffer> {
    const authRequest = AuthRequest.fromBuffer(msg);
    const statusMessage = await this.p2pClient.handleAuthRequestFromPeer(authRequest, peer).catch(_ => undefined);
    if (statusMessage === undefined) {
      return Buffer.alloc(0);
    }

    // Find a validator address that is in the set
    const allRegisteredValidators = await this.epochCache.getRegisteredValidators();
    const addressToUse = this.getValidatorAddresses().find(
      address => allRegisteredValidators.find(v => v.equals(address)) !== undefined,
    );
    if (addressToUse === undefined) {
      // We don't have a registered address
      return Buffer.alloc(0);
    }

    const payloadToSign = authRequest.getPayloadToSign();
    // AUTH_REQUEST doesn't require HA protection - multiple signatures are safe
    const context: SigningContext = { dutyType: DutyType.AUTH_REQUEST };
    const signature = await this.keyStore.signMessageWithAddress(addressToUse, payloadToSign, context);
    const authResponse = new AuthResponse(statusMessage, signature);
    return authResponse.toBuffer();
  }
}
