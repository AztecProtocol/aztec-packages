import { BlockAttestation, BlockProposal, ProposalMessage, Signature } from '@aztec/foundation/sequencer';
import { deepStrictEqual } from 'assert';

const mockAttestationMessage = (): BlockAttestation => {
    const message = new ProposalMessage(Buffer.from("test message"));
    const proposalSignature = new Signature(Buffer.from("test proposal sig"));
    const attestationSignature = new Signature(Buffer.from("test attestation sig"));

    const proposal = new BlockProposal(message, proposalSignature);
    return new BlockAttestation(proposal, attestationSignature);
}

describe("Serde attestation messages", () => {
    it("Should serde a attestation message", () => {
        const attestationMessage = mockAttestationMessage();
        const message = attestationMessage.toBuffer();
        const decodedMessage = BlockAttestation.fromBuffer(message);

        deepStrictEqual(attestationMessage, decodedMessage);
    })
})