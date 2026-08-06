import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/** Confidence a dependency must reach to be returned, requiring a second committed job to use its contract. */
export const PREDICTION_THRESHOLD = 2;

/** Cap on a dependency's confidence, so a contract used by many jobs is still forgotten within a few missed ones. */
export const MAX_CONFIDENCE = 5;

/**
 * Predicts a job's contract dependencies from past jobs of its entry call, so the caller can sync them in parallel.
 *
 * Wallet workloads are repetitive: jobs starting with the same entry call (see {@link EntryCallId}) usually depend on
 * the same contracts. Each dependency carries a confidence score: every committed job of the entry call that uses it
 * adds a point (capped at {@link MAX_CONFIDENCE}) and every one that does not subtracts one, forgetting it at zero.
 * Only dependencies at {@link PREDICTION_THRESHOLD} or above are returned, so one-off dependencies picked by a call's
 * parameters (e.g. the tokens of a single swap) are never predicted.
 *
 * Purely in-memory bookkeeping: the dependencies are lost when PXE is rebuilt (e.g. on restart).
 */
export class ContractCallDependencies {
  private readonly activeJobs: Map<JobId, ActiveJob> = new Map();

  // entry call → dependency → confidence score
  private readonly dependencyConfidence: Map<EntryCallId, Map<ContractAddress, number>> = new Map();

  constructor(
    private readonly enabled: boolean,
    private readonly log: Logger = createLogger('pxe:contract_call_dependencies'),
  ) {}

  /**
   * Records that a job used a contract.
   * @param functionToInvoke - The function that will be invoked on `contractAddress`, or null when nothing will be
   * invoked (e.g. reading notes/events directly).
   * @returns The dependencies of the job's entry call whose confidence reached {@link PREDICTION_THRESHOLD}.
   */
  onContractUsed(
    jobId: JobId,
    contractAddress: AztecAddress,
    functionToInvoke: FunctionSelector | null,
    scopes: AztecAddress[],
  ): AztecAddress[] {
    if (!this.enabled) {
      return [];
    }
    let job = this.activeJobs.get(jobId);
    if (!job) {
      const entryCallId = toEntryCallId(contractAddress, functionToInvoke, scopes);
      this.log.debug(`Job started with entry call ${entryCallId}`, { jobId, entryCallId });
      job = { entryCallId, used: new Set() };
      this.activeJobs.set(jobId, job);
    } else {
      // Only contracts used after the start are considered dependencies.
      job.used.add(contractAddress.toString());
    }

    const dependencies = this.dependencyConfidence.get(job.entryCallId);
    if (!dependencies) {
      return [];
    }
    return [...dependencies.entries()]
      .filter(([, confidence]) => confidence >= PREDICTION_THRESHOLD)
      .map(([contract]) => AztecAddress.fromStringUnsafe(contract));
  }

  /** Raises the confidence of the dependencies the committed job used and lowers the rest, forgetting any at zero. */
  commitJob(jobId: JobId): void {
    const job = this.activeJobs.get(jobId);
    this.activeJobs.delete(jobId);
    if (!job || job.used.size === 0) {
      return;
    }

    const dependencies = this.dependencyConfidence.get(job.entryCallId) ?? new Map<ContractAddress, number>();
    for (const [contract, confidence] of dependencies) {
      const delta = job.used.has(contract) ? 1 : -1;
      const updated = Math.min(confidence + delta, MAX_CONFIDENCE);
      if (updated === 0) {
        dependencies.delete(contract);
      } else {
        dependencies.set(contract, updated);
      }
    }
    // Contracts used for the first time enter at confidence 1, below the prediction threshold.
    [...job.used].filter(contract => !dependencies.has(contract)).forEach(contract => dependencies.set(contract, 1));
    this.dependencyConfidence.set(job.entryCallId, dependencies);

    this.log.debug(`Remembering ${dependencies.size} contract(s) for entry call ${job.entryCallId}`, {
      jobId,
      entryCallId: job.entryCallId,
      confidence: Object.fromEntries(dependencies),
    });
  }

  /** Drops a discarded job without learning. */
  discardJob(jobId: JobId): void {
    this.activeJobs.delete(jobId);
  }

  /** Stops returning a contract for the given job's entry call. */
  forget(jobId: JobId, contractAddress: AztecAddress): void {
    const entryCallId = this.activeJobs.get(jobId)?.entryCallId;
    if (!entryCallId) {
      return;
    }
    const dependencies = this.dependencyConfidence.get(entryCallId);
    if (!dependencies?.delete(contractAddress.toString())) {
      return;
    }
    if (dependencies.size === 0) {
      this.dependencyConfidence.delete(entryCallId);
    }
    this.log.debug(`Dropped ${contractAddress} from the remembered dependencies of entry call ${entryCallId}`, {
      jobId,
      entryCallId,
    });
  }
}

/**
 * Builds an entry call id from a call's contract, function and scopes.
 * The scopes are sorted first, so their order does not matter.
 */
function toEntryCallId(
  contract: AztecAddress,
  functionToInvoke: FunctionSelector | null,
  scopes: AztecAddress[],
): EntryCallId {
  const scopeSet = scopes
    .map(scope => scope.toString())
    .sort()
    .join(',');
  return `${contract.toString()}:${functionToInvoke?.toString() ?? ''}:${scopeSet}`;
}

type JobId = string;

/**
 * Identifies how a job started: the first (contract, function) it used, plus that use's scope set. The scope set
 * separates entry calls that share an entry contract across accounts (e.g. a shared multi-call entrypoint).
 */
type EntryCallId = string;

type ContractAddress = string;

/** An active job's entry call, plus the addresses of the contracts it has used since it started. */
type ActiveJob = {
  readonly entryCallId: EntryCallId;
  readonly used: Set<ContractAddress>;
};
