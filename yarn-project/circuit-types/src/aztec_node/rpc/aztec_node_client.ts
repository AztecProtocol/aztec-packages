import { FunctionSelector, Header } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { ContractData, ExtendedContractData } from '../../contract_data.js';
import { AztecNode } from '../../interfaces/aztec-node.js';
import { NullifierMembershipWitness } from '../../interfaces/nullifier_tree.js';
import { L1ToL2MessageAndIndex } from '../../l1_to_l2_message.js';
import { L2Block } from '../../l2_block.js';
import { ExtendedUnencryptedL2Log, L2BlockL2Logs, LogId } from '../../logs/index.js';
import { SiblingPath } from '../../sibling_path/index.js';
import { Tx, TxHash, TxReceipt } from '../../tx/index.js';
import { TxEffect } from '../../tx_effect.js';

/**
 * Creates a JSON-RPC client to remotely talk to an Aztec Node.
 * @param url - The URL of the Aztec Node.
 * @param fetch - The fetch implementation to use.
 * @returns A JSON-RPC client of Aztec Node.
 */
export function createAztecNodeClient(url: string, fetch = defaultFetch): AztecNode {
  return createJsonRpcClient<AztecNode>(
    url,
    {
      AztecAddress,
      EthAddress,
      ExtendedContractData,
      ExtendedUnencryptedL2Log,
      ContractData,
      Fr,
      EventSelector,
      FunctionSelector,
      Header,
      L2Block,
      TxEffect,
      LogId,
      TxHash,
      SiblingPath,
      L1ToL2MessageAndIndex,
    },
    { Tx, TxReceipt, L2BlockL2Logs, NullifierMembershipWitness },
    false,
    'node',
    fetch,
  );
}
