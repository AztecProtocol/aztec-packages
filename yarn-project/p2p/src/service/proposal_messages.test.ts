import { BlockProposal, ProposalMessage, Signature } from '@aztec/foundation/sequencer';
import { deepStrictEqual } from 'assert';

const mockProposal = (): BlockProposal => {
    const message = new ProposalMessage(Buffer.from("test message"));
    const signature = new Signature(Buffer.from("test signature"));
    return new BlockProposal(
        message,
        signature
    )
}

describe("Serde attestation messages", () => {
    it("Should serde a attestation message", () => {
        const proposal = mockProposal();
        const message = proposal.toBuffer();
        const decodedMessage = BlockProposal.fromBuffer(message);

        deepStrictEqual(proposal, decodedMessage);
    })
})