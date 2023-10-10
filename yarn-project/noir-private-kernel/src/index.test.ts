import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { WitnessMap, executeCircuit } from '@noir-lang/acvm_js';
import { abiEncode } from '@noir-lang/noirc_abi';

import { InputType as InitInputType } from './types/private_kernel_init_types.js';

import { PrivateKernelInitArtifact } from './index.js';

/* eslint-disable */
const defaultInputType: InitInputType = {
  input: {
    tx_request: {
      origin: {
        inner: '0'
      },
      args_hash: '0',
      tx_context: {
        is_fee_payment_tx: false,
        is_rebate_payment_tx: false,
        is_contract_deployment_tx: false,
        contract_deployment_data: {
          deployer_public_key: {
            x: '0',
            y: '0'
          },
          constructor_vk_hash: '0',
          function_tree_root: '0',
          contract_address_salt: '0',
          portal_contract_address: {
            inner: '0'
          }
        },
        chain_id: '0',
        version: '0'
      },
      function_data: {
        selector: {
          inner: '0'
        },
        is_internal: false,
        is_private: false,
        is_constructor: false
      }
    },
    private_call: {
      call_stack_item: {
        inner: {
          contract_address: {
            inner: '0'
          },
          public_inputs: {
            call_context: {
              msg_sender: {
                inner: '0'
              },
              storage_contract_address: {
                inner: '0'
              },
              portal_contract_address: {
                inner: '0'
              },
              function_selector: {
                inner: '0'
              },
              is_delegate_call: false,
              is_static_call: false,
              is_contract_deployment: false
            },
            args_hash: '0',
            return_values: [],
            read_requests: [],
            new_commitments: [],
            new_nullifiers: [],
            nullified_commitments: [],
            private_call_stack: [],
            public_call_stack: [],
            new_l2_to_l1_msgs: [],
            encrypted_logs_hash: [],
            unencrypted_logs_hash: [],
            encrypted_log_preimages_length: '0',
            unencrypted_log_preimages_length: '0',
            historical_block_data: {
              blocks_tree_root: '0',
              block: {
                private_data_tree_root: '0',
                nullifier_tree_root: '0',
                contract_tree_root: '0',
                l1_to_l2_data_tree_root: '0',
                public_data_tree_root: '0',
                global_variables_hash: '0'
              },
              private_kernel_vk_tree_root: '0'
            },
            contract_deployment_data: {
              deployer_public_key: {
                x: '0',
                y: '0'
              },
              constructor_vk_hash: '0',
              function_tree_root: '0',
              contract_address_salt: '0',
              portal_contract_address: {
                inner: '0'
              }
            },
            chain_id: '0',
            version: '0'
          },
          is_execution_request: false,
          function_data: {
            selector: {
              inner: '0'
            },
            is_internal: false,
            is_private: false,
            is_constructor: false
          }
        }
      },
      private_call_stack_preimages: [],
      proof: {},
      vk: {},
      function_leaf_membership_witness: {
        leaf_index: '0',
        sibling_path: []
      },
      contract_leaf_membership_witness: {
        leaf_index: '0',
        sibling_path: []
      },
      read_request_membership_witnesses: [],
      portal_contract_address: {
        inner: '0'
      },
      acir_hash: '0'
    }
  }
};



describe('Private kernel', () => {
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  it('Executes private kernel init circuit with all zeroes', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const decodedBytecode = Buffer.from(PrivateKernelInitArtifact.bytecode, 'base64');
    const numWitnesses = 1811; // The number of input witnesses in the private kernel init circuit
    const initialWitness: WitnessMap = new Map();
    for (let i = 1; i <= numWitnesses; i++) {
      initialWitness.set(i, '0x00');
    }

    const _witnessMap = await executeCircuit(decodedBytecode, initialWitness, () => {
      throw Error('unexpected oracle during execution');
    });

    logger('Executed private kernel init circuit with all zeroes');
  });

  it.only('Executes private kernel init circuit with abi all zeroes', async () => {
    // logger('Initialized Noir instance with private kernel init circuit');

    const decodedBytecode = Buffer.from(PrivateKernelInitArtifact.bytecode, 'base64');

     const witnessMap = abiEncode(PrivateKernelInitArtifact.abi, defaultInputType, null);

  });
});
