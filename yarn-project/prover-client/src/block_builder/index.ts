import { type BlockBuilder, type MerkleTreeReadOperations } from '@aztec/circuits.js/interfaces/server';

export * from './light.js';
export interface BlockBuilderFactory {
  create(db: MerkleTreeReadOperations): BlockBuilder;
}
