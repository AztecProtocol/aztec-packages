import { AztecAddress, EthAddress, Fr, Point, PrivateKey } from '@aztec/circuits.js';
import { createJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';
import {
  AztecRPC,
  ContractData,
  ContractDeploymentTx,
  ContractPublicData,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
} from '@aztec/types';

export { mustSucceedFetch } from '@aztec/foundation/json-rpc/client';

export const createAztecRpcClient = (url: string, fetch = defaultFetch): AztecRPC =>
  createJsonRpcClient<AztecRPC>(
    url,
    {
      AztecAddress,
      TxExecutionRequest,
      ContractData,
      ContractPublicData,
      TxHash,
      EthAddress,
      Point,
      PrivateKey,
      Fr,
    },
    { Tx, ContractDeploymentTx, TxReceipt },
    false,
    fetch,
  );
