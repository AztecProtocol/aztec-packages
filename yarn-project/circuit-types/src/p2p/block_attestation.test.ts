// Serde test for the block attestation type

import { makeHeader } from "@aztec/circuits.js/testing"
import {  BlockAttestation } from "./block_attestation.js";

describe("Block Attestation serialization / deserialization", () => {
    const makeBlockAttestation = ():  BlockAttestation => {
        // TODO: why are these now across crates - circuit types / circuits.js 
        // have not been taken care of properly
        const blockHeader = makeHeader(1);
        const signature = Buffer.alloc(64, 1);

        return new BlockAttestation(
            blockHeader,
            signature
        );
    }

    it("Should serialize / deserialize", () => {
        const attestation = makeBlockAttestation();

        const serialized = attestation.toBuffer();
        const deserialized = BlockAttestation.fromBuffer(serialized);

        expect(deserialized).toEqual(attestation);
    })
})