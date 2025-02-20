import { type BlockBuilder, type MerkleTreeReadOperations } from '@aztec/circuit-types/interfaces/server';

export * from './light.js';
export interface BlockBuilderFactory {
  create(db: MerkleTreeReadOperations): BlockBuilder;
}
