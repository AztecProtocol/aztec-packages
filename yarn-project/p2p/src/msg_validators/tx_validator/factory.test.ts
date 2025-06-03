import { Fr } from '@aztec/foundation/fields';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import type { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { AbortError } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type MessageValidator, type TxValidateFn, createTxMessageValidators, validateInParallel } from './factory.js';

describe('GasTxValidator', () => {
  // Mocks
  let synchronizer: MockProxy<WorldStateSynchronizer>;
  let contractSource: MockProxy<ContractDataSource>;
  let proofVerifier: MockProxy<ClientProtocolCircuitVerifier>;

  beforeEach(() => {
    synchronizer = mock<WorldStateSynchronizer>();
    contractSource = mock<ContractDataSource>();
    proofVerifier = mock<ClientProtocolCircuitVerifier>();
  });

  it('inserts tx proof validator last', () => {
    const validators = createTxMessageValidators(
      1,
      synchronizer,
      new GasFees(1, 1),
      1,
      2,
      Fr.ZERO,
      contractSource,
      proofVerifier,
    );
    expect(Object.keys(validators[0])).toEqual([
      'dataValidator',
      'metadataValidator',
      'doubleSpendValidator',
      'gasValidator',
      'phasesValidator',
      'blockHeaderValidator',
    ]);
    expect(Object.keys(validators[1])).toEqual(['proofValidator']);
  });
});

describe('validateInParallel', () => {
  let mockValidatorFns: Record<'foo' | 'bar' | 'baz', jest.Mock<TxValidateFn>>;
  let validators: Record<'foo' | 'bar' | 'baz', MessageValidator>;
  let tx: Tx;

  beforeEach(async () => {
    mockValidatorFns = {
      foo: jest.fn<TxValidateFn>(),
      bar: jest.fn<TxValidateFn>(),
      baz: jest.fn<TxValidateFn>(),
    };

    validators = {
      foo: {
        validator: { validateTx: mockValidatorFns.foo },
        severity: PeerErrorSeverity.LowToleranceError,
      },
      bar: {
        validator: { validateTx: mockValidatorFns.bar },
        severity: PeerErrorSeverity.MidToleranceError,
      },
      baz: {
        validator: { validateTx: mockValidatorFns.baz },
        severity: PeerErrorSeverity.HighToleranceError,
      },
    };

    tx = await mockTx();
  });

  it('returns ok when all validators pass', async () => {
    Object.values(mockValidatorFns).forEach(fn => fn.mockResolvedValue({ result: 'valid' }));
    await expect(validateInParallel(tx, validators)).resolves.toEqual({ allPassed: true });
  });

  it('returns not ok when a validator fails', async () => {
    mockValidatorFns.foo.mockResolvedValue({ result: 'valid' });
    mockValidatorFns.bar.mockResolvedValue({ result: 'valid' });
    mockValidatorFns.baz.mockResolvedValue({ result: 'invalid', reason: ['Error'] });

    await expect(validateInParallel(tx, validators)).resolves.toEqual({
      allPassed: false,
      failure: {
        name: 'baz',
        isValid: { result: 'invalid', reason: ['Error'] },
        severity: PeerErrorSeverity.HighToleranceError,
      },
    });
  });

  it('returns the first failure when some validators fail', async () => {
    mockValidatorFns.foo.mockResolvedValue({ result: 'invalid', reason: ['Foo error'] });
    mockValidatorFns.bar.mockResolvedValue({ result: 'valid' });
    mockValidatorFns.baz.mockResolvedValue({ result: 'invalid', reason: ['Baz error'] });

    await expect(validateInParallel(tx, validators)).resolves.toEqual({
      allPassed: false,
      failure: {
        name: 'foo',
        isValid: { result: 'invalid', reason: ['Foo error'] },
        severity: PeerErrorSeverity.LowToleranceError,
      },
    });
  });

  it('cancels validators when any failure is encountered', async () => {
    const bazPromise = promiseWithResolvers<any>();
    mockValidatorFns.foo.mockResolvedValue({ result: 'invalid', reason: ['Foo error'] });
    mockValidatorFns.bar.mockResolvedValue({ result: 'valid' });
    mockValidatorFns.baz.mockReturnValue(bazPromise.promise);

    const allPromise = validateInParallel(tx, validators);

    await sleep(10);
    expect(mockValidatorFns.baz.mock.calls[0][1]?.aborted).toEqual(true);
    bazPromise.reject(new AbortError());

    await expect(allPromise).resolves.toEqual({
      allPassed: false,
      failure: {
        name: 'foo',
        isValid: { result: 'invalid', reason: ['Foo error'] },
        severity: PeerErrorSeverity.LowToleranceError,
      },
    });
  });
});
