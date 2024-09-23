import { type BlockSimulator, type MerkleTreeOperations } from '@aztec/circuit-types';

export * from './orchestrator.js';
export * from './light.js';
export interface BlockBuilderFactory {
  create(db: MerkleTreeOperations): BlockSimulator;
}
