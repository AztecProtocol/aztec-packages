import { BlockProposal, TxHash, BlockWithAttestations, BlockAttestation } from "@aztec/circuit-types";
import { ValidatorKeyStore } from "./key_store/interface.js";
import { ValidationService } from "./duties/validation_service.js";
import { Header } from "@aztec/circuits.js";
import { LocalKeyStore } from "./key_store/local_key_store.js";
import { ValidatorClientConfig } from "./config.js";
import {RunningPromise} from "@aztec/foundation/running-promise";
import { P2P } from "@aztec/p2p";
import { createDebugLogger } from "@aztec/foundation/log";
import { sleep } from "@aztec/foundation/sleep";

// Temporarily hardcode the committee size
const COMMITTEE_SIZE = 4;

/** Validator
 * 
 * 
 */
export class ValidatorClient {
    private runningPromise?: RunningPromise;
    private attestationPoolingIntervalMs: number = 1000;

    private validationService: ValidationService;

    constructor(
        keyStore: ValidatorKeyStore,
        private p2pClient: P2P,
        private log = createDebugLogger('aztec:validator')
    ) {
        // We need to setup and store all of the currently active validators 
        // This can likely be done from the smart contract

        this.validationService = new ValidationService(keyStore);

        this.log.verbose("Initialized validator");
    }

    static new(config: ValidatorClientConfig, p2pClient: P2P) {
        // TODO(md); Only support the local key store for now
        const localKeyStore = new LocalKeyStore(config.validatorPrivateKey);

        const validator = new ValidatorClient(
            localKeyStore,
            p2pClient
        );
        validator.registerBlockProposalHandler();
        return validator;
    }

    public async start(){
        // Sync the committee from the smart contract

        // await this.syncSmartContract();
        this.log.info("Validator started");
    }

    /**
     * TODO: read the current committee and epoch information from the smart contract
     */
    // private syncSmartContract(){

    // }

    public registerBlockProposalHandler(){
        const handler = (block: BlockProposal): Promise<BlockAttestation> => {
            return this.validationService.attestToProposal(block);
        }
        this.p2pClient.registerBlockProposalHandler(handler);
    }

    attestToProposal(proposal: BlockProposal) {
        return this.validationService.attestToProposal(proposal);
    }

    async createBlockProposal(header: Header, txs: TxHash[]): Promise<BlockProposal> {
        return this.validationService.attestToBlock(header, txs);
    }

    async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
        return this.p2pClient.broadcastProposal(proposal);
    }

    // TODO: should the validator client know about the slot it will be receiving from
    private async collectAttestations(slot: bigint): Promise<BlockAttestation[]> {
        // Wait and poll the p2pClients attestation pool for this block 
        // until we have enough attestations 

        // Target is temporarily hardcoded, but will be calculated
        let target = COMMITTEE_SIZE;
        let collected = 0;
        let attestations: BlockAttestation[] = [];
        while (collected < target) {
            collected = attestations.length;
            attestations = await this.p2pClient.getAttestationsForSlot(slot);

            // We wait for a bit to re check the attestation pool
            await sleep(this.attestationPoolingIntervalMs);
        }

        return attestations;
    }

    public async broadcastAndCollectAttestations(proposal: BlockProposal): Promise<BlockWithAttestations> {
        await this.broadcastBlockProposal(proposal);

        const attestations = await this.collectAttestations(proposal.header.globalVariables.slotNumber.toBigInt());
        return BlockWithAttestations.fromBlockAndBlockAttestations(proposal, attestations);
    }
}