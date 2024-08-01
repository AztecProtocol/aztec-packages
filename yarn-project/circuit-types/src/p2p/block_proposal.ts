import { Header } from "@aztec/circuits.js";
import { TxHash } from "../index.js";
import { BufferReader, serializeToBuffer } from "@aztec/foundation/serialize";
import { Gossipable } from "./gossipable.js";
import { GOSSIP_PREFIX, TOPIC_VERSION } from "./interface.js";
import { TopicType } from "./interface.js";

/**
 * BlockProposal
 * 
 * A block proposal is created by the leader of the chain proposing a sequence of transactions to 
 * be included in the head of the chain
 */
export class BlockProposal extends Gossipable {
    constructor(
        /** The block header, after execution of the below sequence of transactions */
        public readonly header: Header,
        /** The sequence of transactions in the block */
        public readonly txs: TxHash[],
        /** The signer of the BlockProposal over the header of the new block*/
        public readonly signature: Buffer
    ) {
        super()
    }

    static override getTopic = GOSSIP_PREFIX + TopicType.block_proposal + TOPIC_VERSION;
    override messageIdentifier(): TxHash {
        // Yuck!
        return TxHash.fromBuffer(this.header.hash().toBuffer());
    }

    toBuffer(): Buffer {
        return serializeToBuffer([
            this.header,
            this.txs.length,
            this.txs,
            this.signature.length,
            this.signature
        ]);
    }

    static fromBuffer(buf: Buffer | BufferReader): BlockProposal  {
        const reader = BufferReader.asReader(buf);
        return new BlockProposal(
            reader.readObject(Header),
            reader.readArray(reader.readNumber(), TxHash),
            reader.readBuffer()
        );
    }
}