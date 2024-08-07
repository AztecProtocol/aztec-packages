import { Header } from "@aztec/circuits.js";
import { ValidatorKeyStore } from "../key_store/interface.js";
import {BlockAttestation, BlockProposal, TxHash} from "@aztec/circuit-types";


export class ValidationService {

    constructor(
        private keyStore: ValidatorKeyStore
    ){}

    // TODO: maybe include a signature type with the serialized values
    async attestToProposal(proposal: BlockProposal) : Promise<BlockAttestation> {
        // TODO: check that the current validator is correct

        // TODO: more than just the header
        const buf = proposal.header.toBuffer();
        const sig = await this.keyStore.sign(buf);
        return new BlockAttestation(proposal.header, sig);
    }

    async attestToBlock(header: Header, txs: TxHash[]): Promise<BlockProposal> {
        // Note: just signing header for now
        const headerBuf = header.toBuffer();
        const sig = await this.keyStore.sign(headerBuf);

        return new BlockProposal(
            header, 
            txs,
            sig
        );
    }
}