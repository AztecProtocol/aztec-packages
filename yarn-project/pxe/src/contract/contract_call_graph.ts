import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { ChangeSetId } from '../storage/staged_write_coordinator.js';

/** Confidence a call must reach to be predicted. */
export const PREDICTION_THRESHOLD = 2;

/** Cap on a call's confidence, so a function called by many operations is still dropped within a few missed ones. */
export const MAX_CONFIDENCE = 5;

/**
 * A call graph over contract functions - who calls whom - learned from the direct calls observed in past operations, so
 * a function's predicted callees can sync their contracts before execution reaches them.
 *
 * A function's direct calls tend to repeat across operations: constrained delivery calls the handshake registry, a
 * transfer may call an authwit, an AMM calls its tokens. The same function does not always make the same calls, though:
 * they can depend on context or storage state. A call must therefore repeat often enough to earn confidence before it
 * is predicted. Calls are keyed per function, not per contract, since different functions of a contract call different
 * contracts. See {@link learn} for how each call's confidence is learned from committed operations.
 *
 * Purely in-memory bookkeeping: the graph is lost when PXE is rebuilt (e.g. on restart).
 */
export class ContractCallGraph {
  // change set -> caller function -> functions it called directly
  private readonly activeChangeSets: Map<ChangeSetId, Map<CallKey, Set<CallKey>>> = new Map();

  // caller function -> function it calls directly -> confidence score
  private readonly callConfidence: Map<CallKey, Map<CallKey, number>> = new Map();

  constructor(private readonly enabled: boolean) {}

  /** Records that `caller` directly called `callee` in the given change set. */
  recordCall({
    changeSetId,
    caller,
    callee,
  }: {
    changeSetId: ChangeSetId;
    caller: ContractFunction;
    callee: ContractFunction;
  }): void {
    // Same-contract calls are ignored: our goal is to warm a callee's contract ahead of use, and the target of such
    // a call is already warm.
    if (!this.enabled || caller.address.equals(callee.address)) {
      return;
    }
    let callsInChangeSet = this.activeChangeSets.get(changeSetId);
    if (!callsInChangeSet) {
      callsInChangeSet = new Map();
      this.activeChangeSets.set(changeSetId, callsInChangeSet);
    }
    let callees = callsInChangeSet.get(toCallKey(caller));
    if (!callees) {
      callees = new Set();
      callsInChangeSet.set(toCallKey(caller), callees);
    }
    callees.add(toCallKey(callee));
  }

  /** Predicts the functions `caller` will call directly. */
  predictDirectCallees(caller: ContractFunction): ContractFunction[] {
    const callees = this.callConfidence.get(toCallKey(caller)) ?? new Map<CallKey, number>();
    return [...callees.entries()]
      .filter(([, confidence]) => confidence >= PREDICTION_THRESHOLD)
      .map(([callee]) => fromCallKey(callee));
  }

  /**
   * Learns from a committed change set: the calls it observed update each caller's confidence. A function that called
   * nothing keeps its callees untouched, so read-only uses (e.g. reading notes or events) erode nothing.
   */
  learn(changeSetId: ChangeSetId): void {
    const callsInChangeSet = this.activeChangeSets.get(changeSetId);
    this.activeChangeSets.delete(changeSetId);
    if (!callsInChangeSet) {
      return;
    }

    for (const [caller, observed] of callsInChangeSet) {
      const callees = this.callConfidence.get(caller) ?? new Map<CallKey, number>();
      for (const [callee, confidence] of callees) {
        const delta = observed.has(callee) ? 1 : -1;
        const updated = Math.min(confidence + delta, MAX_CONFIDENCE);
        if (updated === 0) {
          callees.delete(callee);
        } else {
          callees.set(callee, updated);
        }
      }
      // First-time callees enter at 1, below PREDICTION_THRESHOLD: a call must repeat before it is predicted.
      [...observed].filter(callee => !callees.has(callee)).forEach(callee => callees.set(callee, 1));
      this.callConfidence.set(caller, callees);
    }
  }

  /** Drops a discarded change set without learning. */
  discard(changeSetId: ChangeSetId): void {
    this.activeChangeSets.delete(changeSetId);
  }
}

/** A specific function of a contract, as observed in a call. */
export type ContractFunction = {
  /** The address of the contract the function belongs to. */
  address: AztecAddress;
  /** The selector of the function. */
  selector: FunctionSelector;
};

/** A {@link ContractFunction} flattened to a `contractAddress:selector` string, so maps can key on it. */
export type CallKey = `0x${string}:${string}`;

export function toCallKey({ address, selector }: ContractFunction): CallKey {
  return `${address.toString()}:${selector.toString()}`;
}

function fromCallKey(key: CallKey): ContractFunction {
  const [address, selector] = key.split(':');
  return { address: AztecAddress.fromStringUnsafe(address), selector: FunctionSelector.fromString(selector) };
}
