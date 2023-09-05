import { AztecAddress, CompleteAddress, EthAddress, Fr, GrumpkinScalar, Point } from '@aztec/circuits.js';
import { createJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';
import {
  AztecRPC,
  ContractData,
  ExtendedContractData,
  L2BlockL2Logs,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
} from '@aztec/types';

export { makeFetch } from '@aztec/foundation/json-rpc/client';

export const createAztecRpcClient = (url: string, fetch = defaultFetch): AztecRPC =>
  createJsonRpcClient<AztecRPC>(
    url,
    {
      CompleteAddress,
      AztecAddress,
      TxExecutionRequest,
      ContractData,
      ExtendedContractData,
      TxHash,
      EthAddress,
      Point,
      Fr,
      GrumpkinScalar,
    },
    { Tx, TxReceipt, L2BlockL2Logs },
    false,
    fetch,
  );
