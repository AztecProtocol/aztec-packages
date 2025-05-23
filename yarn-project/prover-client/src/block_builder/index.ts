import type { BlockBuilder, MerkleTreeReadOperations } from '@aztec/stdlib/interfaces/server';

export * from './light.js';
export interface BlockBuilderFactory {
  create(db: MerkleTreeReadOperations): BlockBuilder;
}
