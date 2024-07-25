import {BlockAttestation, BlockProposal, Signature} from "@aztec/foundation/sequencer";
import {privateKeyToAccount} from "viem/accounts";


export class AztecValidator {
    private signer;

    constructor(private signingKey: string) {
        this.signer = privateKeyToAccount(signingKey as `0x${string})`);
    }

    async attestToProposal(proposal: BlockProposal) : Promise<BlockAttestation> {
        // Sign the proposal as a buffer
        const message = `0x${proposal.toBuffer().toString("hex")}`;
        const signature = await this.signer.signMessage({message})

        // TODO(md): add conversion types
        const sigBuffer = new Signature(Buffer.from(signature.slice(2), "hex"));

        return new BlockAttestation(
            proposal,
            sigBuffer
        );
    }
}