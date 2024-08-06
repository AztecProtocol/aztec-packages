import { BlockProposal, TxHash } from "@aztec/circuit-types";
import { ValidatorKeyStore } from "./key_store/interface.js";
import { BlockAttestationService } from "./duties/block_attestation_service.js";
import { Header } from "@aztec/circuits.js";

/** Validator
 * 
 * 
 */
export class ValidatorClient {
    private attestationService: BlockAttestationService;

    constructor(
        keyStore: ValidatorKeyStore,
    ) {
        // We need to setup and store all of the currently active validators 
        // This can likely be done from the smart contract

        this.attestationService = new BlockAttestationService(keyStore);
    }


    attestToProposal(proposal: BlockProposal) {
        return this.attestationService.attestToProposal(proposal);
    }

    async createBlockProposal(header: Header, txs: TxHash[]): Promise<BlockProposal> {
        return this.attestationService.attestToBlock(header, txs);
    }
}