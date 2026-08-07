import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { ContractCallDependencies, MAX_CONFIDENCE, PREDICTION_THRESHOLD } from './contract_call_dependencies.js';

describe('ContractCallDependencies', () => {
  let callDependencies: ContractCallDependencies;

  const account = makeAddress(1);
  const token = makeAddress(2);
  const fpc = makeAddress(3);

  beforeEach(() => {
    callDependencies = new ContractCallDependencies(true);
  });

  it('returns nothing for a contract it has never seen', () => {
    expect(dependenciesOf(account)).toEqual([]);
  });

  it('does not predict a callee until enough committed jobs observe the call', () => {
    runJobs({
      count: PREDICTION_THRESHOLD - 1,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });

    expect(dependenciesOf(account)).toEqual([]);
  });

  it('predicts a callee once enough committed jobs observe the call', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });

    expect(dependenciesOf(account)).toEqual(addressStrings([token, fpc]));
  });

  it('predicts only direct callees, not callees of callees', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: account, callee: fpc },
        { caller: fpc, callee: token },
      ],
    });

    expect(dependenciesOf(account)).toEqual(addressStrings([fpc]));
    expect(dependenciesOf(fpc)).toEqual(addressStrings([token]));
  });

  it("predicts a contract's callees even when its own callers rarely call it", () => {
    runJob({
      jobId: 'rare',
      calls: [{ caller: account, callee: token }],
    });
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: token, callee: fpc }] });

    // The account rarely calls the token, so the account predicts nothing. But the token's own dependencies are known,
    // ready for the moment a job actually uses it.
    expect(dependenciesOf(account)).toEqual([]);
    expect(dependenciesOf(token)).toEqual(addressStrings([fpc]));
  });

  it('ignores self-calls', () => {
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: token, callee: token }] });

    expect(dependenciesOf(token)).toEqual([]);
  });

  it('does not learn from discarded jobs', () => {
    runJobs({ count: PREDICTION_THRESHOLD - 1, calls: [{ caller: account, callee: token }] });
    callDependencies.onContractUsed('discarded', token, account);
    callDependencies.discardJob('discarded');

    expect(dependenciesOf(account)).toEqual([]);
  });

  it('leaves confidence untouched by jobs in which the caller makes no calls', () => {
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: account, callee: token }] });

    // The account calls no one in these jobs, so the confidence of the callees it did not call is unaffected.
    for (const jobId of ['read1', 'read2']) {
      callDependencies.onContractUsed(jobId, account, undefined);
      callDependencies.commitJob(jobId);
    }

    expect(dependenciesOf(account)).toEqual(addressStrings([token]));
  });

  it('keeps predicting a dependency at full confidence through every miss it tolerates', () => {
    runJobs({
      count: MAX_CONFIDENCE,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });
    runJobs({ count: MAX_CONFIDENCE - PREDICTION_THRESHOLD, calls: [{ caller: account, callee: token }] });

    expect(dependenciesOf(account)).toEqual(addressStrings([token, fpc]));
  });

  it('caps confidence, so a heavily called dependency stops being predicted one miss past that tolerance', () => {
    runJobs({
      count: MAX_CONFIDENCE * 2,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });
    runJobs({ count: MAX_CONFIDENCE - PREDICTION_THRESHOLD + 1, calls: [{ caller: account, callee: token }] });

    expect(dependenciesOf(account)).toEqual(addressStrings([token]));
  });

  it('drops a dependency below the threshold on a miss and predicts it again after one hit', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });
    expect(dependenciesOf(account)).toEqual(addressStrings([token, fpc]));

    runJob({ jobId: 'miss', calls: [{ caller: account, callee: token }] });
    expect(dependenciesOf(account)).toEqual(addressStrings([token]));

    runJob({
      jobId: 'refresh',
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });

    expect(dependenciesOf(account)).toEqual(addressStrings([token, fpc]));
  });

  it('stops predicting a forgotten contract from every caller that called it', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
        { caller: token, callee: fpc },
      ],
    });
    expect(dependenciesOf(account)).toEqual(addressStrings([token, fpc]));
    expect(dependenciesOf(token)).toEqual(addressStrings([fpc]));

    callDependencies.forget(fpc);

    expect(dependenciesOf(account)).toEqual(addressStrings([token]));
    expect(dependenciesOf(token)).toEqual([]);
  });

  it('never records dependencies when disabled', () => {
    callDependencies = new ContractCallDependencies(false);
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: account, callee: token },
        { caller: account, callee: fpc },
      ],
    });

    expect(dependenciesOf(account)).toEqual([]);
  });

  /** Runs `count` whole jobs, each observing the given direct calls. */
  function runJobs({ count, calls }: { count: number; calls: Call[] }) {
    for (let i = 0; i < count; i++) {
      runJob({ jobId: `job${i}`, calls });
    }
  }

  /** Runs a whole job: uses the first caller as the entry, then each callee with its caller, and commits. */
  function runJob({ jobId, calls }: { jobId: string; calls: Call[] }) {
    callDependencies.onContractUsed(jobId, calls[0].caller, undefined);
    for (const { caller, callee } of calls) {
      callDependencies.onContractUsed(jobId, callee, caller);
    }
    callDependencies.commitJob(jobId);
  }

  /** Returns the direct dependencies predicted for the given contract, as sorted address strings. */
  function dependenciesOf(contract: AztecAddress): string[] {
    return callDependencies
      .predictDirectDependencies(contract)
      .map(address => address.toString())
      .sort();
  }
});

/** A direct call observed by a job. */
type Call = { caller: AztecAddress; callee: AztecAddress };

function makeAddress(index: number): AztecAddress {
  return AztecAddress.fromNumberUnsafe(0x1000 + index);
}

function addressStrings(addresses: AztecAddress[]): string[] {
  return addresses.map(address => address.toString()).sort();
}
