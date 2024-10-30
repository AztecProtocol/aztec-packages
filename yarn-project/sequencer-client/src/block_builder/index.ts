import { type BlockBuilder, type MerkleTreeReadOperations } from '@aztec/circuit-types';

export * from './orchestrator.js';
export * from './light.js';
export interface BlockBuilderFactory {
  create(db: MerkleTreeReadOperations): BlockBuilder;
}
