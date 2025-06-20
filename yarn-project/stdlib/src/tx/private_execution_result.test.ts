import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { PrivateCircuitPublicInputs } from '../kernel/private_circuit_public_inputs.js';
import {
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  collectNoteHashLeafIndexMap,
  collectNoteHashNullifierCounterMap,
  getFinalMinRevertibleSideEffectCounter,
} from './private_execution_result.js';

function emptyCallExecutionResult(): PrivateCallExecutionResult {
  return new PrivateCallExecutionResult(
    Buffer.from(''),
    Buffer.from(''),
    new Map(),
    PrivateCircuitPublicInputs.empty(),
    new Map(),
    [],
    new Map(),
    [],
    [],
    [],
    [],
  );
}

function emptyExecutionResult(): PrivateExecutionResult {
  return new PrivateExecutionResult(emptyCallExecutionResult(), Fr.zero(), []);
}

describe('execution_result', () => {
  let executionResult: PrivateExecutionResult;

  beforeEach(() => {
    executionResult = emptyExecutionResult();
  });

  describe('serialization', () => {
    it('serializes and deserializes correctly', async () => {
      const instance = await PrivateExecutionResult.random();
      expect(await jsonParseWithSchema(jsonStringify(instance), PrivateExecutionResult.schema)).toEqual(instance);
    });
  });

  describe('collectNoteHashLeafIndexMap', () => {
    it('returns a map for note hash leaf indexes', () => {
      executionResult.entrypoint.noteHashLeafIndexMap = new Map();
      executionResult.entrypoint.noteHashLeafIndexMap.set(12n, 99n);
      executionResult.entrypoint.noteHashLeafIndexMap.set(34n, 88n);
      const res = collectNoteHashLeafIndexMap(executionResult);
      expect(res.size).toBe(2);
      expect(res.get(12n)).toBe(99n);
      expect(res.get(34n)).toBe(88n);
    });

    it('returns a map containing note hash leaf indexes for nested executions', () => {
      executionResult.entrypoint.noteHashLeafIndexMap.set(12n, 99n);
      executionResult.entrypoint.noteHashLeafIndexMap.set(34n, 88n);

      const childExecution0 = emptyCallExecutionResult();
      childExecution0.noteHashLeafIndexMap.set(56n, 77n);

      const childExecution1 = emptyCallExecutionResult();
      childExecution1.noteHashLeafIndexMap.set(78n, 66n);
      const grandchildExecution = emptyCallExecutionResult();
      grandchildExecution.noteHashLeafIndexMap.set(90n, 55n);
      childExecution1.nestedExecutionResults = [grandchildExecution];

      executionResult.entrypoint.nestedExecutionResults = [childExecution0, childExecution1];

      const res = collectNoteHashLeafIndexMap(executionResult);
      expect(res.size).toBe(5);
      expect(res.get(12n)).toBe(99n);
      expect(res.get(34n)).toBe(88n);
      expect(res.get(56n)).toBe(77n);
      expect(res.get(78n)).toBe(66n);
      expect(res.get(90n)).toBe(55n);
    });
  });

  describe('collectNoteHashNullifierCounterMap', () => {
    it('returns a map for note hash leaf indexes', () => {
      executionResult.entrypoint.noteHashNullifierCounterMap = new Map();
      executionResult.entrypoint.noteHashNullifierCounterMap.set(12, 99);
      executionResult.entrypoint.noteHashNullifierCounterMap.set(34, 88);
      const res = collectNoteHashNullifierCounterMap(executionResult);
      expect(res.size).toBe(2);
      expect(res.get(12)).toBe(99);
      expect(res.get(34)).toBe(88);
    });

    it('returns a map containing note hash leaf indexes for nested executions', () => {
      executionResult.entrypoint.noteHashNullifierCounterMap.set(12, 99);
      executionResult.entrypoint.noteHashNullifierCounterMap.set(34, 88);

      const childExecution0 = emptyCallExecutionResult();
      childExecution0.noteHashNullifierCounterMap.set(56, 77);

      const childExecution1 = emptyCallExecutionResult();
      childExecution1.noteHashNullifierCounterMap.set(78, 66);
      const grandchildExecution = emptyCallExecutionResult();
      grandchildExecution.noteHashNullifierCounterMap.set(90, 55);
      childExecution1.nestedExecutionResults = [grandchildExecution];

      executionResult.entrypoint.nestedExecutionResults = [childExecution0, childExecution1];

      const res = collectNoteHashNullifierCounterMap(executionResult);
      expect(res.size).toBe(5);
      expect(res.get(12)).toBe(99);
      expect(res.get(34)).toBe(88);
      expect(res.get(56)).toBe(77);
      expect(res.get(78)).toBe(66);
      expect(res.get(90)).toBe(55);
    });
  });

  describe('getFinalMinRevertibleSideEffectCounter', () => {
    beforeEach(() => {
      const childExecution0 = emptyCallExecutionResult();
      const childExecution1 = emptyCallExecutionResult();
      const grandchildExecution = emptyCallExecutionResult();
      childExecution1.nestedExecutionResults = [grandchildExecution];
      executionResult.entrypoint.nestedExecutionResults = [childExecution0, childExecution1];
    });

    it('returns a zero counter', () => {
      const res = getFinalMinRevertibleSideEffectCounter(executionResult);
      expect(res).toBe(0);
    });

    it('returns the actual counter', () => {
      executionResult.entrypoint.publicInputs.minRevertibleSideEffectCounter = new Fr(123);
      const res = getFinalMinRevertibleSideEffectCounter(executionResult);
      expect(res).toBe(123);
    });

    it('returns the actual counter in a nested call', () => {
      executionResult.entrypoint.nestedExecutionResults[1].publicInputs.minRevertibleSideEffectCounter = new Fr(123);
      const res = getFinalMinRevertibleSideEffectCounter(executionResult);
      expect(res).toBe(123);
    });
  });
});
