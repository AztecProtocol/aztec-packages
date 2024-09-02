import { type BlockAttestation, type BlockProposal, type TxHash } from '@aztec/circuit-types';
import { type Header } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type P2P } from '@aztec/p2p';

import { type ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import { type ValidatorKeyStore } from './key_store/interface.js';
import { LocalKeyStore } from './key_store/local_key_store.js';

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;

  // Block validation responsiblities
  createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal>;
  attestToProposal(proposal: BlockProposal): void;

  // TODO(md): possible abstraction leak
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
    private attestationPoolingIntervalMs: number,
    private attestationWaitTimeoutMs: number,
    private log = createDebugLogger('aztec:validator')) {
    //TODO: We need to setup and store all of the currently active validators https://github.com/AztecProtocol/aztec-packages/issues/7962

    this.validationService = new ValidationService(keyStore);
    this.log.verbose('Initialized validator');
  }

  static new(config: ValidatorClientConfig, p2pClient: P2P) {
    const localKeyStore = new LocalKeyStore(config.validatorPrivateKey);

    const validator = new ValidatorClient(
      localKeyStore,
      p2pClient,
      config.attestationPoolingIntervalMs,
      config.attestationWaitTimeoutMs
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
    const handler = (block: BlockProposal): Promise<BlockAttestation> => {
      return this.validationService.attestToProposal(block);
    };
    this.p2pClient.registerBlockProposalHandler(handler);
  }

  async attestToProposal(proposal: BlockProposal): Promise<BlockAttestation> {
    // Check that we have all of the proposal's transactions in our p2p client
    const txHashes = proposal.txs;
    const haveTx = txHashes.map(txHash => this.p2pClient.getTxStatus(txHash));

    if (haveTx.length !== txHashes.length) {
      console.log("WE ARE MISSING TRANSCTIONS");
    }

    return this.validationService.attestToProposal(proposal);
  }

  createBlockProposal(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal> {
    return this.validationService.createBlockProposal(header, archive, txs);
  }

  broadcastBlockProposal(proposal: BlockProposal): void {
    this.p2pClient.broadcastProposal(proposal);
  }

  // Target is temporarily hardcoded, for a test, but will be calculated from smart contract
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7962)
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7976): require suitable timeouts
  async collectAttestations(
    proposal: BlockProposal,
    numberOfRequiredAttestations: number,
  ): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClients attestation pool for this block
    // until we have enough attestations

    const startTime = Date.now();

    const slot = proposal.header.globalVariables.slotNumber.toBigInt();

    // TODO: tidy
    numberOfRequiredAttestations -= 1; // We self sign

    this.log.info(`Waiting for ${numberOfRequiredAttestations} attestations for slot: ${slot}`);

    const myAttestation = await this.attestToProposal(proposal);

    let attestations: BlockAttestation[] = [];
    while (attestations.length < numberOfRequiredAttestations) {
      attestations = [myAttestation, ...(await this.p2pClient.getAttestationsForSlot(slot))];

      // Rememebr we can subtract 1 from this if we self sign
      if (attestations.length < numberOfRequiredAttestations) {
        this.log.verbose(`SEAN: collected ${attestations.length} attestations so far ${numberOfRequiredAttestations} required`);
        this.log.verbose(`Waiting ${this.attestationPoolingIntervalMs}ms for more attestations...`);
        await sleep(this.attestationPoolingIntervalMs);
      }

      // FIX(md): kinna sad looking code
      if (Date.now() - startTime > this.attestationWaitTimeoutMs) {
        this.log.error(`Timeout waiting for ${numberOfRequiredAttestations} attestations for slot, ${slot}`);
        throw new Error(`Timeout waiting for ${numberOfRequiredAttestations} attestations for slot, ${slot}`);
      }
    }
    this.log.info(`Collected all attestations for slot, ${slot}`);

    return attestations;
  }
}
