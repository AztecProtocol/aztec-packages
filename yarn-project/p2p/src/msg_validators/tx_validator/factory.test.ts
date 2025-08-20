import { Fr } from '@aztec/foundation/fields';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import { type MockProxy, mock } from 'jest-mock-extended';

import { createTxMessageValidators } from './factory.js';

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
      0n,
      2,
      synchronizer,
      new GasFees(1, 1),
      1,
      2,
      Fr.ZERO,
      contractSource,
      proofVerifier,
      true,
    );
    expect(Object.keys(validators[0])).toEqual([
      'txsPermittedValidator',
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
