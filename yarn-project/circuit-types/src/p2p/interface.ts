import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
import { Tx } from '../tx/tx.js';
import { BlockAttestation } from './block_attestation.js';
import { BlockProposal } from './block_proposal.js';
import { type Gossipable } from './gossipable.js';
import { TopicType } from './topic_type.js';

export interface RawGossipMessage {
  topic: string;
  data: Uint8Array;
}

// Force casts as we know that each field here extends Gossipable, and we just want types from Gossipable
export const TopicTypeMap: Record<string, typeof Gossipable> = {
  [TopicType.tx]: Tx as unknown as typeof Gossipable,
  [TopicType.block_proposal]: BlockProposal as unknown as typeof Gossipable,
  [TopicType.block_attestation]: BlockAttestation as unknown as typeof Gossipable,
  [TopicType.epoch_proof_quote]: EpochProofQuote as unknown as typeof Gossipable,
};

/**
 * Map from topic to deserialiser
 *
 * Used in msgIdFn libp2p to get the p2pMessageIdentifier from a message
 */
export const TopicToDeserializer = {
  [Tx.p2pTopic]: Tx.fromBuffer,
  [BlockProposal.p2pTopic]: BlockProposal.fromBuffer,
  [BlockAttestation.p2pTopic]: BlockAttestation.fromBuffer,
  [EpochProofQuote.p2pTopic]: EpochProofQuote.fromBuffer,
};
