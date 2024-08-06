import { Header } from "@aztec/circuits.js";
import { ValidatorKeyStore } from "../key_store/interface.js";
import {BlockProposal, TxHash} from "@aztec/circuit-types";


export class BlockAttestationService {

    constructor(
        private keyStore: ValidatorKeyStore
    ){}

    // TODO: maybe include a signature type with the serialized values
    async attestToProposal(proposal: BlockProposal) : Promise<Buffer> {
        // TODO: check that the current validator is correct

        // TODO: more than just the header
        const buf = proposal.header.toBuffer();
        return await this.keyStore.sign(buf);
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