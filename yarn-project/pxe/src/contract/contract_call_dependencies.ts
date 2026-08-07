import { type Logger, createLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/** Confidence a dependency must reach to be predicted. */
export const PREDICTION_THRESHOLD = 2;

/** Cap on a dependency's confidence, so a contract called by many jobs is still forgotten within a few missed ones. */
export const MAX_CONFIDENCE = 5;

/**
 * Predicts the contracts a job is about to need from the direct calls observed in past jobs, so the caller can sync
 * them in parallel.
 *
 * Wallet workloads are repetitive: a contract usually calls the same contracts every time it executes. Each committed
 * job in which a caller calls a callee adds a point of confidence to that dependency (capped at
 * {@link MAX_CONFIDENCE}); each committed job in which the caller calls other contracts but not that one subtracts a
 * point, forgetting the dependency at zero. A job in which a contract calls nothing leaves its dependencies untouched,
 * so read-only uses (e.g. reading notes or events) erode nothing.
 *
 * Purely in-memory bookkeeping: the dependencies are lost when PXE is rebuilt (e.g. on restart).
 */
export class ContractCallDependencies {
  // job → caller contract → contracts it called directly
  private readonly activeJobs: Map<JobId, Map<ContractAddress, Set<ContractAddress>>> = new Map();

  // caller contract → contract it calls directly → confidence score
  private readonly dependencyConfidence: Map<ContractAddress, Map<ContractAddress, number>> = new Map();

  constructor(
    private readonly enabled: boolean,
    private readonly log: Logger = createLogger('pxe:contract_call_dependencies'),
  ) {}

  /**
   * Records that `caller` directly called `callee` in the given job. Top-level uses (no caller) only ever appear on the
   * caller side of a dependency, so they record nothing themselves.
   */
  onContractUsed(jobId: JobId, callee: AztecAddress, caller: AztecAddress | undefined): void {
    if (!this.enabled || !caller || caller.equals(callee)) {
      return;
    }
    let callsInJob = this.activeJobs.get(jobId);
    if (!callsInJob) {
      callsInJob = new Map();
      this.activeJobs.set(jobId, callsInJob);
    }
    let callees = callsInJob.get(caller.toString());
    if (!callees) {
      callees = new Set();
      callsInJob.set(caller.toString(), callees);
    }
    callees.add(callee.toString());
  }

  /** Predicts the contracts the given one will call directly: callees at {@link PREDICTION_THRESHOLD}+. */
  predictDirectDependencies(contractAddress: AztecAddress): AztecAddress[] {
    const dependencies =
      this.dependencyConfidence.get(contractAddress.toString()) ?? new Map<ContractAddress, number>();
    return [...dependencies.entries()]
      .filter(([, confidence]) => confidence >= PREDICTION_THRESHOLD)
      .map(([contract]) => AztecAddress.fromStringUnsafe(contract));
  }

  /** Learns dependencies from the calls the committed job observed. */
  commitJob(jobId: JobId): void {
    const callsInJob = this.activeJobs.get(jobId);
    this.activeJobs.delete(jobId);
    if (!callsInJob) {
      return;
    }

    for (const [caller, callees] of callsInJob) {
      const dependencies = this.dependencyConfidence.get(caller) ?? new Map<ContractAddress, number>();
      for (const [contract, confidence] of dependencies) {
        const delta = callees.has(contract) ? 1 : -1;
        const updated = Math.min(confidence + delta, MAX_CONFIDENCE);
        if (updated === 0) {
          dependencies.delete(contract);
        } else {
          dependencies.set(contract, updated);
        }
      }
      // Contracts called for the first time enter at confidence 1, below the prediction threshold.
      [...callees].filter(contract => !dependencies.has(contract)).forEach(contract => dependencies.set(contract, 1));
      this.dependencyConfidence.set(caller, dependencies);
    }
  }

  /** Drops a discarded job without learning. */
  discardJob(jobId: JobId): void {
    this.activeJobs.delete(jobId);
  }

  /** Stops predicting a contract, dropping it from every caller known to call it. */
  forget(contractAddress: AztecAddress): void {
    const contract = contractAddress.toString();
    for (const [caller, dependencies] of this.dependencyConfidence) {
      if (dependencies.delete(contract) && dependencies.size === 0) {
        this.dependencyConfidence.delete(caller);
      }
    }
  }
}

type JobId = string;

type ContractAddress = string;
