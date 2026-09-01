import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { ChangeSetId } from '../storage/staged_write_coordinator.js';
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

  it('does not predict a callee until enough committed change sets observe the call', () => {
    runChangeSets({
      count: PREDICTION_THRESHOLD - 1,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  it('predicts a callee once enough committed change sets observe the call', () => {
    runChangeSets({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('predicts only direct callees, not callees of callees', () => {
    runChangeSets({
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
    runChangeSets({ count: PREDICTION_THRESHOLD, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
    expect(calleesOf(accountClaim)).toEqual([]);
  });

  it("predicts a function's callees even when its own callers rarely call it", () => {
    runChangeSet({
      changeSetId: 'rare',
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });
    runChangeSets({ count: PREDICTION_THRESHOLD, calls: [{ caller: tokenTransfer, callee: fpcFee }] });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
    expect(calleesOf(tokenTransfer)).toEqual(callKeys([fpcFee]));
  });

  it('ignores same-contract calls', () => {
    runChangeSets({ count: PREDICTION_THRESHOLD, calls: [{ caller: tokenTransfer, callee: tokenBalance }] });

    expect(calleesOf(tokenTransfer)).toEqual([]);
  });

  it('does not learn from discarded change sets', () => {
    runChangeSets({ count: PREDICTION_THRESHOLD - 1, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });
    callGraph.recordCall({ changeSetId: 'discarded', caller: accountEntrypoint, callee: tokenTransfer });
    callGraph.discard('discarded');

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  it('leaves confidence untouched by change sets in which the caller makes no calls', () => {
    runChangeSets({ count: PREDICTION_THRESHOLD, calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });

    // The account calls no one in these change sets, so the confidence of the callees it did not call is unaffected.
    for (const changeSetId of ['read1', 'read2']) {
      callGraph.learn(changeSetId);
    }

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
  });

  it('keeps predicting a callee at full confidence through every miss it tolerates', () => {
    runChangeSets({
      count: MAX_CONFIDENCE,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    runChangeSets({
      count: MAX_CONFIDENCE - PREDICTION_THRESHOLD,
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('caps confidence, so a heavily called callee stops being predicted one miss past that tolerance', () => {
    runChangeSets({
      count: MAX_CONFIDENCE * 2,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    runChangeSets({
      count: MAX_CONFIDENCE - PREDICTION_THRESHOLD + 1,
      calls: [{ caller: accountEntrypoint, callee: tokenTransfer }],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));
  });

  it('drops a callee below the threshold on a miss and predicts it again after one hit', () => {
    runChangeSets({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });
    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));

    runChangeSet({ changeSetId: 'miss', calls: [{ caller: accountEntrypoint, callee: tokenTransfer }] });
    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer]));

    runChangeSet({
      changeSetId: 'refresh',
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual(callKeys([tokenTransfer, fpcFee]));
  });

  it('never records calls when disabled', () => {
    callGraph = new ContractCallGraph(false);
    runChangeSets({
      count: PREDICTION_THRESHOLD,
      calls: [
        { caller: accountEntrypoint, callee: tokenTransfer },
        { caller: accountEntrypoint, callee: fpcFee },
      ],
    });

    expect(calleesOf(accountEntrypoint)).toEqual([]);
  });

  /** Runs `count` whole change sets, each observing the given direct calls. */
  function runChangeSets({ count, calls }: { count: number; calls: Call[] }) {
    for (let i = 0; i < count; i++) {
      runChangeSet({ changeSetId: `change-set-${i}`, calls });
    }
  }

  /** Runs a whole change set: records each direct call and learns from it as committed. */
  function runChangeSet({ changeSetId, calls }: { changeSetId: ChangeSetId; calls: Call[] }) {
    for (const { caller, callee } of calls) {
      callGraph.recordCall({ changeSetId, caller, callee });
    }
    callGraph.learn(changeSetId);
  }

  /** Returns the direct callees predicted for the given function, as sorted `address:selector` strings. */
  function calleesOf(caller: ContractFunction): string[] {
    return callKeys(callGraph.predictDirectCallees(caller));
  }
});

/** A direct call observed by a change set. */
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
