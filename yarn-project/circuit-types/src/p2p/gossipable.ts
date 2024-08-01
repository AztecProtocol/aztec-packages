import { TxHash } from "../index.js";

/**
 * Gossipable
 * 
 * Any class which extends gossipable will be able to be Gossiped over the p2p network
 */
export abstract class Gossipable {
    static getTopic: string;
    abstract toBuffer(): Buffer;

    // TODO: comment on what this is (a hash)! TODO: maybe alias this?
    abstract messageIdentifier(): TxHash;
}
