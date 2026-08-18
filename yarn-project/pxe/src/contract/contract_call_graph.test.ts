import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import {
  ContractCallGraph,
  type ContractFunction,
  MAX_CONFIDENCE,
  PREDICTION_THRESHOLD,
} from './contract_call_graph.js';

describe('ContractCallGraph', () => {
  let callGraph: ContractCallGraph;

  const accountEntrypoint = fn(1, 1);
  const accountClaim = fn(1, 2);
  const tokenTransfer = fn(2, 1);
  const tokenBalance = fn(2, 2);
  const fpcFee = fn(3, 1);

  beforeEach(() => {
    callGraph = new ContractCallGraph(true);
  });

  it('returns nothing for a function it has never seen', () => {
    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  it('does not predict a callee until enough committed jobs observe the call', () => {
    runJobs({
      count: PREDICTION_THRESHOLD - 1,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  it('predicts a callee once enough committed jobs observe the call', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('predicts only direct callees, not callees of callees', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: fpcFee },
        { caller: fpcFee, callee: tokenTransfer },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([fpcFee]));
    expect(calleesOf(fpcFee)).toEqual(callKeys([tokenTransfer]));
  });

  it('keys calls per function, so a sibling function of the same contract predicts nothing', () => {
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
    expect(calleesOf(accountClaim)).toEqual([]);
  });

  it("predicts a function's callees even when its own callers rarely call it", () => {
    runJob({
      jobId: 'rare',
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: tokenTransfer, callee: fpcFee }] });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
    expect(calleesOf(tokenTransfer)).toEqual(callKeys([fpcFee]));
  });

  it('ignores same-contract calls', () => {
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: tokenTransfer, callee: tokenBalance }] });

    expect(calleesOf(tokenTransfer)).toEqual([]);
  });

  it('does not learn from discarded jobs', () => {
    runJobs({ count: PREDICTION_THRESHOLD - 1, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });
    callGraph.recordCall({ jobId: 'discarded', caller: accountEntrypoint, callee: tokenTransfer });
    callGraph.discardJob('discarded');

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  it('leaves confidence untouched by jobs in which the caller makes no calls', () => {
    runJobs({ count: PREDICTION_THRESHOLD, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });

    // The account calls no one in these jobs, so the confidence of the callees it did not call is unaffected.
    for (const jobId of ['read1', 'read2']) {
      callGraph.commitJob(jobId);
    }

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
  });

  it('keeps predicting a callee at full confidence through every miss it tolerates', () => {
    runJobs({
      count: MAX_CONFIDENCE,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    runJobs({
      count: MAX_CONFIDENCE - PREDICTION_THRESHOLD,
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('caps confidence, so a heavily called callee stops being predicted one miss past that tolerance', () => {
    runJobs({
      count: MAX_CONFIDENCE * 2,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    runJobs({
      count: MAX_CONFIDENCE - PREDICTION_THRESHOLD + 1,
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
  });

  it('drops a callee below the threshold on a miss and predicts it again after one hit', () => {
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));

    runJob({ jobId: 'miss', calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });
    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));

    runJob({
      jobId: 'refresh',
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('never records calls when disabled', () => {
    callGraph = new ContractCallGraph(false);
    runJobs({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  /** Runs `count` whole jobs, each observing the given direct calls. */
  function runJobs({ count, calls }: { count: number; calls: Call[] }) {
    for (let i = 0; i < count; i++) {
      runJob({ jobId: `job${i}`, calls });
    }
  }

  /** Runs a whole job: records each direct call and commits. */
  function runJob({ jobId, calls }: { jobId: string; calls: Call[] }) {
    for (const { caller, callee } of calls) {
      callGraph.recordCall({ jobId, caller, callee });
    }
    callGraph.commitJob(jobId);
  }

  /** Returns the direct callees predicted for the given function, as sorted `address:selector` strings. */
  function calleesOf(caller: ContractFunction): string[] {
    return callKeys(callGraph.predictDirectCallees(caller));
  }
});

/** A direct call observed by a job. */
type Call = { caller: ContractFunction; callee: ContractFunction };

function fn(contractIndex: number, functionIndex: number): ContractFunction {
  return { address: makeAddress(contractIndex), selector: new FunctionSelector(0x1000 + functionIndex) };
}

function makeAddress(index: number): AztecAddress {
  return AztecAddress.fromNumberUnsafe(0x1000 + index);
}

/** Flattens functions to sorted `address:selector` strings, so sets of predictions can be compared. */
function callKeys(functions: ContractFunction[]): string[] {
  return functions.map(({ address, selector }) => `${address.toString()}:${selector.toString()}`).sort();
}
