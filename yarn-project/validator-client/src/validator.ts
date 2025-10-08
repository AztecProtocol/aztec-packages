import type { EpochCache } from '@aztec/epoch-cache';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2P, PeerId, TxProvider } from '@aztec/p2p';
import { AuthRequest, AuthResponse, BlockProposalValidator, ReqRespSubProtocol } from '@aztec/p2p';
import {
  OffenseType,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type Watcher,
  type WatcherEmitter,
} from '@aztec/slasher';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CommitteeAttestationsAndSigners, L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, Validator, ValidatorClientFullConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { StateReference, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import type { TypedDataDefinition } from 'viem';

import { BlockProposalHandler, type BlockProposalValidationFailureReason } from './block_proposal_handler.js';
import type { ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
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

  // Whether it has already registered handlers on the p2p client
  private hasRegisteredHandlers = false;

  // Used to check if we are sending the same proposal twice
  private previousProposal?: BlockProposal;

  private lastEpochForCommitteeUpdateLoop: bigint | undefined;
  private epochCacheUpdateLoop: RunningPromise;

  private proposersOfInvalidBlocks: Set<string> = new Set();

  protected constructor(
    private keyStore: NodeKeystoreAdapter,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private blockProposalHandler: BlockProposalHandler,
    private config: ValidatorClientFullConfig,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator'),
  ) {
    super();
    this.tracer = telemetry.getTracer('Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore, log.createChild('validation-service'));

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), log, 1000);

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

  static new(
    config: ValidatorClientConfig & Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'>,
    blockBuilder: IFullNodeBlockBuilder,
    epochCache: EpochCache,
    p2pClient: P2P,
    blockSource: L2BlockSource,
    l1ToL2MessageSource: L1ToL2MessageSource,
    txProvider: TxProvider,
    keyStoreManager: KeystoreManager,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const metrics = new ValidatorMetrics(telemetry);
    const blockProposalValidator = new BlockProposalValidator(epochCache);
    const blockProposalHandler = new BlockProposalHandler(
      blockBuilder,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      blockProposalValidator,
      config,
      metrics,
      dateProvider,
      telemetry,
    );

    const validator = new ValidatorClient(
      NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager),
      epochCache,
      p2pClient,
      blockProposalHandler,
      config,
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

  // Proxy method for backwards compatibility with tests
  public reExecuteTransactions(proposal: BlockProposal, txs: any[], l1ToL2Messages: Fr[]): Promise<any> {
    return this.blockProposalHandler.reexecuteTransactions(proposal, txs, l1ToL2Messages);
  }

  public signWithAddress(addr: EthAddress, msg: TypedDataDefinition) {
    return this.keyStore.signTypedDataWithAddress(addr, msg);
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

    await this.registerHandlers();

    const myAddresses = this.getValidatorAddresses();
    const inCommittee = await this.epochCache.filterInCommittee('now', myAddresses);
    if (inCommittee.length > 0) {
      this.log.info(
        `Started validator with addresses in current validator committee: ${inCommittee
          .map(a => a.toString())
          .join(', ')}`,
      );
    } else {
      this.log.info(`Started validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
    }
    this.epochCacheUpdateLoop.start();

    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
  }

  /** Register handlers on the p2p client */
  public async registerHandlers() {
    if (!this.hasRegisteredHandlers) {
      this.hasRegisteredHandlers = true;
      this.log.debug(`Registering validator handlers for p2p client`);

      const handler = (block: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> =>
        this.attestToProposal(block, proposalSender);
      this.p2pClient.registerBlockProposalHandler(handler);

      const myAddresses = this.getValidatorAddresses();
      this.p2pClient.registerThisValidatorAddresses(myAddresses);

      await this.p2pClient.addReqRespSubProtocol(ReqRespSubProtocol.AUTH, this.handleAuthRequest.bind(this));
    }
  }

  async attestToProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> {
    const slotNumber = proposal.slotNumber.toBigInt();
    const proposer = proposal.getSender();

    // Check that I have any address in current committee before attesting
    const inCommittee = await this.epochCache.filterInCommittee(slotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;
    const incFailedAttestation = (reason: string) => this.metrics.incFailedAttestations(1, reason, partOfCommittee);

    const proposalInfo = { ...proposal.toBlockInfo(), proposer: proposer.toString() };
    this.log.info(`Received proposal for block ${proposal.blockNumber} at slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
    });

    // Reexecute txs if we are part of the committee so we can attest, or if slashing is enabled so we can slash
    // invalid proposals even when not in the committee, or if we are configured to always reexecute for monitoring purposes.
    const { validatorReexecute, slashBroadcastedInvalidBlockPenalty, alwaysReexecuteBlockProposals } = this.config;
    const shouldReexecute =
      (slashBroadcastedInvalidBlockPenalty > 0n && validatorReexecute) ||
      (partOfCommittee && validatorReexecute) ||
      alwaysReexecuteBlockProposals;

    const validationResult = await this.blockProposalHandler.handleBlockProposal(
      proposal,
      proposalSender,
      !!shouldReexecute,
    );

    if (!validationResult.isValid) {
      this.log.warn(`Proposal validation failed: ${validationResult.reason}`, proposalInfo);
      incFailedAttestation(validationResult.reason || 'unknown');

      // Slash invalid block proposals
      if (
        validationResult.reason &&
        SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT.includes(validationResult.reason) &&
        slashBroadcastedInvalidBlockPenalty > 0n
      ) {
        this.log.warn(`Slashing proposer for invalid block proposal`, proposalInfo);
        this.slashInvalidBlock(proposal);
      }
      return undefined;
    }

    // Check that I have any address in current committee before attesting
    if (!partOfCommittee) {
      this.log.verbose(`No validator in the current committee, skipping attestation`, proposalInfo);
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(`Attesting to proposal for block ${proposal.blockNumber} at slot ${slotNumber}`, proposalInfo);
    this.metrics.incAttestations(inCommittee.length);

    // If the above function does not throw an error, then we can attest to the proposal
    return this.createBlockAttestationsFromProposal(proposal, inCommittee);
  }

  private slashInvalidBlock(proposal: BlockProposal) {
    const proposer = proposal.getSender();

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
        epochOrSlot: proposal.slotNumber.toBigInt(),
      },
    ]);
  }

  async createBlockProposal(
    blockNumber: number,
    header: CheckpointHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
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
      proposerAddress,
      { ...options, broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal },
    );
    this.previousProposal = newProposal;
    return newProposal;
  }

  async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
    await this.p2pClient.broadcastProposal(proposal);
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
  ): Promise<Signature> {
    return await this.validationService.signAttestationsAndSigners(attestationsAndSigners, proposer);
  }

  async collectOwnAttestations(proposal: BlockProposal): Promise<BlockAttestation[]> {
    const slot = proposal.payload.header.slotNumber.toBigInt();
    const inCommittee = await this.epochCache.filterInCommittee(slot, this.getValidatorAddresses());
    this.log.debug(`Collecting ${inCommittee.length} self-attestations for slot ${slot}`, { inCommittee });
    return this.createBlockAttestationsFromProposal(proposal, inCommittee);
  }

  async collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this block until we have enough attestations
    const slot = proposal.payload.header.slotNumber.toBigInt();
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

    let attestations: BlockAttestation[] = [];
    while (true) {
      const collectedAttestations = await this.p2pClient.getAttestationsForSlot(slot, proposalId);
      const oldSenders = attestations.map(attestation => attestation.getSender());
      for (const collected of collectedAttestations) {
        const collectedSender = collected.getSender();
        if (
          !myAddresses.some(address => address.equals(collectedSender)) &&
          !oldSenders.some(sender => sender.equals(collectedSender))
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

      this.log.debug(`Collected ${attestations.length} attestations so far`);
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }

  private async createBlockAttestationsFromProposal(
    proposal: BlockProposal,
    attestors: EthAddress[] = [],
  ): Promise<BlockAttestation[]> {
    const attestations = await this.validationService.attestToProposal(proposal, attestors);
    await this.p2pClient.addAttestations(attestations);
    return attestations;
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
    const signature = await this.keyStore.signMessageWithAddress(addressToUse, payloadToSign);
    const authResponse = new AuthResponse(statusMessage, signature);
    return authResponse.toBuffer();
  }
}
