import { MerkleTreeId, Tx, type BlockAttestation, type BlockProposal, type TxHash } from '@aztec/circuit-types';
import { type Header } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DoubleSpendTxValidator, type P2P } from '@aztec/p2p';

import { type ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import {
  AttestationTimeoutError,
  FailedToReExecuteTransactionsError,
  InvalidValidatorPrivateKeyError,
  PublicProcessorNotProvidedError,
  TransactionsNotAvailableError,
  ReExStateMismatchError
} from './errors/validator.error.js';
import { type ValidatorKeyStore } from './key_store/interface.js';
import { LocalKeyStore } from './key_store/local_key_store.js';
import { LightPublicProcessor, LightPublicProcessorFactory } from '@aztec/simulator';

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;

  // Block validation responsiblities
  createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal>;
  attestToProposal(proposal: BlockProposal): void;

  broadcastBlockProposal(proposal: BlockProposal): void;
  collectAttestations(proposal: BlockProposal, numberOfRequiredAttestations: number): Promise<BlockAttestation[]>;
}


/** Validator Client
 */
export class ValidatorClient implements Validator {
  private validationService: ValidationService;

  constructor(
    keyStore: ValidatorKeyStore,
    private p2pClient: P2P,
    private config: ValidatorClientConfig,
    private lightPublicProcessorFactory?: LightPublicProcessorFactory | undefined,
    private log = createDebugLogger('aztec:validator'),
  ) {
    this.validationService = new ValidationService(keyStore);
    this.log.verbose('Initialized validator');
  }

  static new(config: ValidatorClientConfig, p2pClient: P2P, publicProcessorFactory?: LightPublicProcessorFactory | undefined) {
    if (!config.validatorPrivateKey) {
      throw new InvalidValidatorPrivateKeyError();
    }

    //TODO: We need to setup and store all of the currently active validators https://github.com/AztecProtocol/aztec-packages/issues/7962
    if (config.validatorReEx && publicProcessorFactory === undefined){
      throw new PublicProcessorNotProvidedError();
    }

    const privateKey = validatePrivateKey(config.validatorPrivateKey);
    const localKeyStore = new LocalKeyStore(privateKey);

    const validator = new ValidatorClient(
      localKeyStore,
      p2pClient,
      config,
      publicProcessorFactory,
    );
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

  async attestToProposal(proposal: BlockProposal): Promise<BlockAttestation | undefined> {
    // Check that all of the tranasctions in the proposal are available in the tx pool before attesting
    try {
      await this.ensureTransactionsAreAvailable(proposal);

      if (this.config.validatorReEx) {
        this.log.verbose(`Re-executing transactions in the proposal before attesting`);
        await this.reExecuteTransactions(proposal);
      }

    } catch (error: any) {
      if (error instanceof TransactionsNotAvailableError) {
        this.log.error(`Transactions not available, skipping attestation ${error.message}`);
      } else {
        // TODO(md): this is a catch all error handler
        this.log.error(`Failed to attest to proposal: ${error.message}`);
      }
      return undefined;
    }
    this.log.debug(
      `Transactions available, attesting to proposal with ${proposal.payload.txHashes.length} transactions`,
    );

    // If the above function does not throw an error, then we can attest to the proposal
    return this.validationService.attestToProposal(proposal);
  }

  // We do not want to run the private state updates until we know if the public has failed or not
  async reExecuteTransactions(proposal: BlockProposal) {
    // TODO(md): currently we are not running the rollups, so cannot calcualte the archive
    // - use pallas new work to do this
    const {header, txHashes} = proposal.payload;

    const txs = await Promise.all(txHashes.map(tx => this.p2pClient.getTxByHash(tx)));
    const filteredTransactions = txs.filter(tx => tx !== undefined);

    // TODO: messy af - think about this more
    if (filteredTransactions.length !== txHashes.length) {
      this.log.error(`Failed to get transactions from the network: ${txHashes.join(', ')}`);
      throw new TransactionsNotAvailableError(txHashes);
    }

      if (!this.lightPublicProcessorFactory) {
        throw new PublicProcessorNotProvidedError();
      }

      // TODO(md): make the transaction validator here
      // TODO(md): for now breaking the rules and makeing the world state sync public on the factory

      const txValidator = new DoubleSpendTxValidator((this.lightPublicProcessorFactory as any).worldStateSynchronizer);
      // We force the state to be synced here
      const targetBlockNumber = header.globalVariables.blockNumber.toNumber() - 1;

      this.log.verbose(`Re-ex: Syncing state to block number ${targetBlockNumber}`);
      const lightProcessor = await this.lightPublicProcessorFactory.createWithSyncedState(targetBlockNumber, undefined, header.globalVariables, txValidator);

      this.log.verbose(`Re-ex: Re-executing transactions`);
      await lightProcessor.process(filteredTransactions as Tx[]);
      this.log.verbose(`Re-ex: Re-execution complete`);

      // TODO: update this to check the archive matches

      const [
        newNullifierTree,
        newNoteHashTree,
        newPublicDataTree,
        // newL1ToL2MessageTree,
      ] = await lightProcessor.getTreeSnapshots();

      // Check the header has this information
      // TODO: replace with archive check once we have it

      // TODO: l1 to l2 messages need to be inserted separately at the start
      // if (header.state.l1ToL2MessageTree.root.toBuffer() !== (await newL1ToL2MessageTree).root) {
      //   this.log.error(`Re-ex: l1ToL2MessageTree does not match`);
      //   throw new ReExStateMismatchError();
      // }
      if (!header.state.partial.nullifierTree.root.toBuffer().equals(newNullifierTree.root)) {
        this.log.error(`Re-ex: nullifierTree does not match, ${header.state.partial.nullifierTree.root.toBuffer().toString('hex')} !== ${newNullifierTree.root.toString('hex')}`);
        throw new ReExStateMismatchError();
      }
      if (!header.state.partial.noteHashTree.root.toBuffer().equals(newNoteHashTree.root)) {
        this.log.error(`Re-ex: noteHashTree does not match, ${header.state.partial.noteHashTree.root.toBuffer().toString('hex')} !== ${newNoteHashTree.root.toString('hex')}`);
        throw new ReExStateMismatchError();
      }
      if (!header.state.partial.publicDataTree.root.toBuffer().equals(newPublicDataTree.root)) {
        this.log.error(`Re-ex: publicDataTree does not match, ${header.state.partial.publicDataTree.root.toBuffer().toString('hex')} !== ${newPublicDataTree.root.toString('hex')}`);
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

  createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal> {
    return this.validationService.createBlockProposal(header, archive, txs);
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

    const myAttestation = await this.validationService.attestToProposal(proposal);

    const startTime = Date.now();

    while (true) {
      const attestations = [myAttestation, ...(await this.p2pClient.getAttestationsForSlot(slot))];

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
        `Collected ${attestations.length} attestations so far, waiting ${this.config.attestationPoolingIntervalMs}ms for more...`,
      );
      await sleep(this.config.attestationPoolingIntervalMs);
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
