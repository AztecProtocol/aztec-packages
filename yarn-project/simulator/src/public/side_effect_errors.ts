import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
} from '@aztec/constants';

import { CheckedPublicExecutionError } from './public_errors.js';

/**
 * Any error that can be thrown during side effect insertion in public.
 * Includes SideEffectLimitReachedError and NullifierCollisionError.
 */
export abstract class SideEffectError extends CheckedPublicExecutionError {
  constructor(message: string) {
    super(message);
    this.name = 'SideEffectInsertionError';
  }
}

export class SideEffectLimitReachedError extends SideEffectError {
  constructor(sideEffectType: string, limit: number) {
    super(`Reached the limit (${limit}) on number of '${sideEffectType}' per tx`);
    this.name = 'SideEffectLimitReachedError';
  }
}

export class MaxCallsToUniqueContractClassIdsError extends SideEffectLimitReachedError {
  constructor() {
    super('contract calls to unique class IDs', MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS);
    this.name = 'MaxCallsToUniqueContractClassIdsError';
  }
}

export class NullifierLimitReachedError extends SideEffectLimitReachedError {
  constructor() {
    super('nullifier', MAX_NULLIFIERS_PER_TX);
    this.name = 'NullifierLimitReachedError';
  }
}

export class NoteHashLimitReachedError extends SideEffectLimitReachedError {
  constructor() {
    super('note hash', MAX_NOTE_HASHES_PER_TX);
    this.name = 'NoteHashLimitReachedError';
  }
}

export class L2ToL1MessageLimitReachedError extends SideEffectLimitReachedError {
  constructor() {
    super('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    this.name = 'L2ToL1MessageLimitReachedError';
  }
}

export class NullifierCollisionError extends SideEffectError {
  constructor(message: string) {
    super(`Nullifier collision: ${message}`);
    this.name = 'NullifierCollisionError';
  }
}
