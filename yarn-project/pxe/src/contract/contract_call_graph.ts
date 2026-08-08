import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/** Confidence a call must reach to be predicted. */
export const PREDICTION_THRESHOLD = 2;

/** Cap on a call's confidence, so a function called by many jobs is still dropped within a few missed ones. */
export const MAX_CONFIDENCE = 5;

/**
 * A call graph over contract functions - who calls whom - learned from the direct calls observed in past jobs, so
 * a function's predicted callees can sync their contracts before execution reaches them.
 *
 * A function's direct calls are fixed along a given execution path: constrained delivery calls the handshake
 * registry, a transfer may call an authwit, an AMM calls its tokens. Calls are keyed per function, not per contract,
 * since different functions of a contract call different contracts. See {@link commitJob} for how each call's
 * confidence is learned from committed jobs.
 *
 * The graph is predictive, not ground truth: a function's calls vary with its arguments and with state, so it only
 * holds the calls observed often enough to bet on.
 *
 * Purely in-memory bookkeeping: the graph is lost when PXE is rebuilt (e.g. on restart).
 */
export class ContractCallGraph {
  // job -> caller function -> functions it called directly
  private readonly activeJobs: Map<JobId, Map<CallKey, Set<CallKey>>> = new Map();

  // caller function -> function it calls directly -> confidence score
  private readonly callConfidence: Map<CallKey, Map<CallKey, number>> = new Map();

  constructor(private readonly enabled: boolean) {}

  /** Records that `caller` directly called `callee` in the given job. */
  recordCall({ jobId, caller, callee }: { jobId: JobId; caller: ContractFunction; callee: ContractFunction }): void {
    // Same-contract calls are ignored: our goal is to warm a callee's contract ahead of use, and the target of such
    // a call is already warm.
    if (!this.enabled || caller.address.equals(callee.address)) {
      return;
    }
    let callsInJob = this.activeJobs.get(jobId);
    if (!callsInJob) {
      callsInJob = new Map();
      this.activeJobs.set(jobId, callsInJob);
    }
    let callees = callsInJob.get(toCallKey(caller));
    if (!callees) {
      callees = new Set();
      callsInJob.set(toCallKey(caller), callees);
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
   * Learns from the calls the committed job observed: each observed call gains a point of confidence (capped at
   * {@link MAX_CONFIDENCE}), each of the caller's known callees it did not call loses one and is dropped at zero,
   * and first-time callees enter below {@link PREDICTION_THRESHOLD}. A function that called nothing keeps its
   * callees untouched, so read-only uses (e.g. reading notes or events) erode nothing.
   */
  commitJob(jobId: JobId): void {
    const callsInJob = this.activeJobs.get(jobId);
    this.activeJobs.delete(jobId);
    if (!callsInJob) {
      return;
    }

    for (const [caller, observed] of callsInJob) {
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
      [...observed].filter(callee => !callees.has(callee)).forEach(callee => callees.set(callee, 1));
      this.callConfidence.set(caller, callees);
    }
  }

  /** Drops a discarded job without learning. */
  discardJob(jobId: JobId): void {
    this.activeJobs.delete(jobId);
  }
}

/** A specific function of a contract, as observed in a call. */
export type ContractFunction = {
  /** The address of the contract the function belongs to. */
  address: AztecAddress;
  /** The selector of the function. */
  selector: FunctionSelector;
};

type JobId = string;

/** A {@link ContractFunction} flattened to a `contractAddress:selector` string, so maps can key on it. */
type CallKey = `0x${string}:${string}`;

function toCallKey({ address, selector }: ContractFunction): CallKey {
  return `${address.toString()}:${selector.toString()}`;
}

function fromCallKey(key: CallKey): ContractFunction {
  const [address, selector] = key.split(':');
  return { address: AztecAddress.fromStringUnsafe(address), selector: FunctionSelector.fromString(selector) };
}
