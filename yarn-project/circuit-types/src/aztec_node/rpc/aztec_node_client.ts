import { FunctionSelector, Header, PublicKeys } from '@aztec/circuits.js';
import { EventSelector, NoteSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { type AztecNode } from '../../interfaces/aztec-node.js';
import { NullifierMembershipWitness } from '../../interfaces/nullifier_tree.js';
import { L2Block } from '../../l2_block.js';
import {
  EncryptedNoteL2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  LogId,
  UnencryptedL2BlockL2Logs,
} from '../../logs/index.js';
import { EpochProofQuote } from '../../prover_coordination/epoch_proof_quote.js';
import { PublicDataWitness } from '../../public_data_witness.js';
import { SiblingPath } from '../../sibling_path/index.js';
import { PublicSimulationOutput, Tx, TxHash, TxReceipt } from '../../tx/index.js';
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
      Buffer32,
      EthAddress,
      EventSelector,
      ExtendedUnencryptedL2Log,
      Fr,
      FunctionSelector,
      Header,
      L2Block,
      LogId,
      PublicDataWitness,
      PublicKeys,
      SiblingPath,
      TxEffect,
      TxHash,
    },
    {
      EncryptedNoteL2BlockL2Logs,
      NoteSelector,
      NullifierMembershipWitness,
      PublicSimulationOutput,
      Tx,
      TxReceipt,
      UnencryptedL2BlockL2Logs,
      EpochProofQuote,
    },
    false,
    'node',
    fetch,
  ) as AztecNode;
}
