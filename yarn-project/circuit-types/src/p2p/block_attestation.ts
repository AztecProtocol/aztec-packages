import { Header } from "@aztec/circuits.js";
import { BufferReader, serializeToBuffer } from "@aztec/foundation/serialize";
import { Gossipable } from "./gossipable.js";
import { GOSSIP_PREFIX, TOPIC_VERSION, TopicType } from "./interface.js";
import { TxHash } from "../index.js";

/**
 * BlockAttestation
 * 
 * A validator that has attested to seeing the contents of a block 
 * will produce a block attestation over the header of the block
 */
export class BlockAttestation extends Gossipable {
    constructor(
        /** The block header the attestation is made over */
        public readonly header: Header,
        /** The signature of the block attester */
        public readonly signature: Buffer
    ) {
        super()
    }

    static override getTopic = GOSSIP_PREFIX + TopicType.block_attestation + TOPIC_VERSION;
    override messageIdentifier(): TxHash {
        // Yuck!
        return TxHash.fromBuffer(this.header.hash().toBuffer());
    }

    toBuffer(): Buffer {
        return serializeToBuffer(
            [
                this.header,
                this.signature.length,
                this.signature
            ]
        )
    }

    static fromBuffer(buf: Buffer | BufferReader): BlockAttestation {
        const reader = BufferReader.asReader(buf);
        return new BlockAttestation(
            reader.readObject(Header),
            reader.readBuffer()
        )
    }
}