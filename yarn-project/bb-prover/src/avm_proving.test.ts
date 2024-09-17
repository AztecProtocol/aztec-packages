import { GlobalVariables } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { proveAndVerifyAvmTestContract } from '../src/test/test_avm.js';

const TIMEOUT = 60_000;
const TIMESTAMP = new Fr(99833);
const GLOBAL_VARIABLES = GlobalVariables.empty();
GLOBAL_VARIABLES.timestamp = TIMESTAMP;

// FIXME: This fails with "main_kernel_value_out_evaluation failed".
describe.skip('AVM WitGen, proof generation and verification', () => {
  it(
    'Should prove and verify bulk_testing',
    async () => {
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP]);
    },
    TIMEOUT,
  );

  it(
    'Should prove that mutated timestamp does not match and a revert is performed',
    async () => {
      // The error assertion string must match with that of assert_timestamp noir function.
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP.add(new Fr(1))], 'timestamp does not match');
    },
    TIMEOUT,
  );

  /************************************************************************
   * Avm Embedded Curve functions
   ************************************************************************/
  describe('AVM Embedded Curve functions', () => {
    const avmEmbeddedCurveFunctions: [string, Fr[]][] = [
      ['elliptic_curve_add_and_double', []],
      ['variable_base_msm', []],
      ['pedersen_commit', [new Fr(1), new Fr(100)]],
    ];
    it.each(avmEmbeddedCurveFunctions)(
      'Should prove %s',
      async (name, calldata) => {
        await proveAndVerifyAvmTestContract(name, calldata);
      },
      TIMEOUT,
    );
  });

  /************************************************************************
   * AvmContext functions
   ************************************************************************/
  describe('AVM Context functions', () => {
    const avmContextFunctions = [
      'get_address',
      'get_storage_address',
      'get_sender',
      'get_fee_per_l2_gas',
      'get_fee_per_da_gas',
      'get_transaction_fee',
      'get_function_selector',
      'get_chain_id',
      'get_version',
      'get_block_number',
      'get_timestamp',
      'get_l2_gas_left',
      'get_da_gas_left',
    ];

    it.each(avmContextFunctions)(
      'Should prove %s',
      async contextFunction => {
        await proveAndVerifyAvmTestContract(contextFunction);
      },
      TIMEOUT,
    );
  });
});
