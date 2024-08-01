import { Tx } from "../tx/tx.js"
import { BlockAttestation } from "./block_attestation.js"
import { BlockProposal } from "./block_proposal.js"

export const GOSSIP_PREFIX = "/aztec/"
export const TOPIC_VERSION = '0.1.0';

export interface RawGossipMessage {
    topic: string,
    data: Uint8Array
}

export enum TopicType {
    tx = "tx",
    block_proposal = "block_proposal",
    block_attestation = "block_attestation"
}

export type TopicTypeMap = {
    [TopicType.tx]: Tx,
    [TopicType.block_proposal]: BlockProposal,
    [TopicType.block_attestation]: BlockAttestation
}