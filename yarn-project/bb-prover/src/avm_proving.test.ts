import { GlobalVariables } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { proveAndVerifyAvmTestContract } from '../src/test/test_avm.js';

const TIMEOUT = 60_000;
const TIMESTAMP = new Fr(99833);
const GLOBAL_VARIABLES = GlobalVariables.empty();
GLOBAL_VARIABLES.timestamp = TIMESTAMP;

describe('AVM WitGen, proof generation and verification', () => {
  const avmFunctionsAndCalldata: [string, Fr[]][] = [
    ['add_args_return', [new Fr(1), new Fr(2)]],
    ['get_address', []],
    ['note_hash_exists', [new Fr(1), new Fr(2)]],
    ['test_get_contract_instance', []],
    ['set_storage_single', [new Fr(1)]],
    ['set_storage_list', [new Fr(1), new Fr(2)]],
    ['read_storage_single', [new Fr(1)]],
    ['read_storage_list', [new Fr(1)]],
    ['new_note_hash', [new Fr(1)]],
    ['new_nullifier', [new Fr(1)]],
    ['nullifier_exists', [new Fr(1)]],
    ['l1_to_l2_msg_exists', [new Fr(1), new Fr(2)]],
    ['send_l2_to_l1_msg', [new Fr(1), new Fr(2)]],
    ['to_radix_le', [new Fr(10)]],
    ['nested_call_to_add', [new Fr(1), new Fr(2)]],
  ];

  it.each(avmFunctionsAndCalldata)(
    'Should prove %s',
    async (name, calldata) => {
      await proveAndVerifyAvmTestContract(name, calldata);
    },
    TIMEOUT,
  );

  /************************************************************************
   * Hashing functions
   ************************************************************************/
  describe('AVM hash functions', () => {
    const avmHashFunctions: [string, Fr[]][] = [
      [
        'keccak_hash',
        [
          new Fr(189),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
          new Fr(0),
        ],
      ],
      [
        'poseidon2_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'sha256_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'pedersen_hash',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
      [
        'pedersen_hash_with_index',
        [new Fr(0), new Fr(1), new Fr(2), new Fr(3), new Fr(4), new Fr(5), new Fr(6), new Fr(7), new Fr(8), new Fr(9)],
      ],
    ];

    it.each(avmHashFunctions)(
      'Should prove %s',
      async (name, calldata) => {
        await proveAndVerifyAvmTestContract(name, calldata);
      },
      TIMEOUT * 2, // We need more for keccak for now
    );
  });

  it(
    'Should prove that timestamp matches',
    async () => {
      await proveAndVerifyAvmTestContract('assert_timestamp', [TIMESTAMP], undefined, GLOBAL_VARIABLES);
    },
    TIMEOUT,
  );

  it(
    'Should prove that mutated timestamp does not match and a revert is performed',
    async () => {
      // The error assertion string must match with that of assert_timestamp noir function.
      await proveAndVerifyAvmTestContract(
        'assert_timestamp',
        [TIMESTAMP.add(new Fr(1))],
        'timestamp does not match',
        GLOBAL_VARIABLES,
      );
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
