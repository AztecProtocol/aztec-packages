import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { ContractCallDependencies, MAX_CONFIDENCE, PREDICTION_THRESHOLD } from './contract_call_dependencies.js';

/** Missed jobs a dependency at full confidence survives while still being predicted. */
const TOLERATED_MISSES = MAX_CONFIDENCE - PREDICTION_THRESHOLD;

describe('ContractCallDependencies', () => {
  let callDependencies: ContractCallDependencies;

  const account = makeAddress(1);
  const token = makeAddress(2);
  const fpc = makeAddress(3);
  const otherAccount = makeAddress(4);
  const entrypoint = makeSelector(0x11223344);
  const otherFunction = makeSelector(0x55667788);
  const scopes = [account];
  const accountEntryCall = { contract: account, functionToInvoke: entrypoint };

  beforeEach(() => {
    callDependencies = new ContractCallDependencies(true);
  });

  it('returns nothing for an entry call it has never seen', () => {
    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual([]);
  });

  it('does not return a contract until enough committed jobs have used it', () => {
    runJobs({ count: PREDICTION_THRESHOLD - 1, entryCall: accountEntryCall, uses: [token, fpc], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual([]);
  });

  it('returns a contract once enough committed jobs of the same entry call use it', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token, fpc]));
  });

  it('does not share dependencies across different entry calls', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token], scopes });

    const otherEntryContract = { contract: token, functionToInvoke: entrypoint };
    const otherEntryFunction = { contract: account, functionToInvoke: otherFunction };
    expect(knownDependencies({ entryCall: otherEntryContract, scopes })).toEqual([]);
    expect(knownDependencies({ entryCall: otherEntryFunction, scopes })).toEqual([]);
  });

  it('does not share dependencies across different scope sets', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes: [otherAccount] })).toEqual([]);
    expect(knownDependencies({ entryCall: accountEntryCall, scopes: [account, otherAccount] })).toEqual([]);
  });

  it('ignores scope order when identifying an entry call', () => {
    const bothAccounts = [account, otherAccount];
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token], scopes: bothAccounts });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes: [otherAccount, account] })).toEqual(
      addressStrings([token]),
    );
  });

  it('distinguishes an entry call with no function from one with a function', () => {
    const noFunctionEntryCall = { contract: account, functionToInvoke: null };
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: noFunctionEntryCall, uses: [token], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual([]);
    expect(knownDependencies({ entryCall: noFunctionEntryCall, scopes })).toEqual(addressStrings([token]));
  });

  it('does not learn from discarded jobs', () => {
    runJobs({ count: PREDICTION_THRESHOLD - 1, entryCall: accountEntryCall, uses: [token], scopes });
    callDependencies.onContractUsed('discarded', account, entrypoint, scopes);
    callDependencies.onContractUsed('discarded', token, otherFunction, scopes);
    callDependencies.discardJob('discarded');

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual([]);
  });

  it('keeps returning a dependency at full confidence through every miss it tolerates', () => {
    runJobs({ count: MAX_CONFIDENCE, entryCall: accountEntryCall, uses: [token, fpc], scopes });
    runJobs({ count: TOLERATED_MISSES, entryCall: accountEntryCall, uses: [token], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token, fpc]));
  });

  it('caps confidence, so a heavily used dependency stops being returned one miss past that tolerance', () => {
    runJobs({ count: MAX_CONFIDENCE * 2, entryCall: accountEntryCall, uses: [token, fpc], scopes });
    runJobs({ count: TOLERATED_MISSES + 1, entryCall: accountEntryCall, uses: [token], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token]));
  });

  it('stops returning a dependency whose confidence falls below the threshold', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });
    runJob({ jobId: 'miss', entryCall: accountEntryCall, uses: [token], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token]));
  });

  it('returns a dependency that fell below the threshold as soon as one job uses it again', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });
    runJob({ jobId: 'miss', entryCall: accountEntryCall, uses: [token], scopes });
    runJob({ jobId: 'refresh', entryCall: accountEntryCall, uses: [token, fpc], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token, fpc]));
  });

  it('stops returning a contract as soon as it is forgotten', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });
    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token, fpc]));

    // Forgetting needs an active job, since that is what identifies the entry call.
    callDependencies.onContractUsed('forgetting', account, entrypoint, scopes);
    callDependencies.forget('forgetting', fpc);

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token]));
  });

  it('ignores forget calls for unknown jobs', () => {
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token], scopes });
    callDependencies.forget('unknownJob', token);

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual(addressStrings([token]));
  });

  it('never returns or records dependencies when disabled', () => {
    callDependencies = new ContractCallDependencies(false);
    runJobs({ count: PREDICTION_THRESHOLD, entryCall: accountEntryCall, uses: [token, fpc], scopes });

    expect(knownDependencies({ entryCall: accountEntryCall, scopes })).toEqual([]);
  });

  /** Runs `count` whole jobs of the given entry call, each using the given contracts. */
  function runJobs({ count, ...job }: { count: number } & Omit<JobRun, 'jobId'>) {
    for (let i = 0; i < count; i++) {
      runJob({ jobId: `job${i}`, ...job });
    }
  }

  /** Runs a whole job: starts it with the given entry call, uses the given contracts, and commits. */
  function runJob({ jobId, entryCall, uses, scopes: jobScopes }: JobRun) {
    callDependencies.onContractUsed(jobId, entryCall.contract, entryCall.functionToInvoke, jobScopes);
    for (const contract of uses) {
      callDependencies.onContractUsed(jobId, contract, otherFunction, jobScopes);
    }
    callDependencies.commitJob(jobId);
  }

  /**
   * Returns the dependencies known for the given entry call, through a job that starts with it and uses nothing
   * else. Committing such a job records no dependencies, so probing does not change what is known.
   */
  function knownDependencies({ entryCall, scopes: jobScopes }: JobStart): string[] {
    const known = callDependencies.onContractUsed('probe', entryCall.contract, entryCall.functionToInvoke, jobScopes);
    callDependencies.commitJob('probe');
    return known.map(address => address.toString()).sort();
  }
});

/** How a job starts: the entry call it makes first, and the scopes every one of its uses runs under. */
type JobStart = {
  entryCall: EntryCall;
  scopes: AztecAddress[];
};

/** A job to run: how it starts, the id it runs under, and the contracts it uses after the start. */
type JobRun = JobStart & {
  jobId: string;
  uses: AztecAddress[];
};

/** The (contract, function) a job starts with. */
type EntryCall = { contract: AztecAddress; functionToInvoke: FunctionSelector | null };

function makeAddress(index: number): AztecAddress {
  return AztecAddress.fromNumberUnsafe(0x1000 + index);
}

function makeSelector(value: number): FunctionSelector {
  return FunctionSelector.fromField(new Fr(value));
}

function addressStrings(addresses: AztecAddress[]): string[] {
  return addresses.map(address => address.toString()).sort();
}
