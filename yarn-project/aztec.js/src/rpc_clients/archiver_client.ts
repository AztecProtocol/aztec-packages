import { EthAddress, Fr } from '@aztec/circuits.js';
import { createJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import {
  ContractData,
  ContractDataSource,
  EncodedContractFunction,
  ExtendedContractData,
  ExtendedUnencryptedL2Log,
  L1ToL2Message,
  L1ToL2MessageSource,
  L2Block,
  L2BlockL2Logs,
  L2BlockSource,
  L2LogsSource,
} from '@aztec/types';

export const createArchiverClient = (
  url: string,
  fetch = makeFetch([1, 2, 3], true),
): L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource =>
  createJsonRpcClient<L2BlockSource & L2LogsSource & ContractDataSource & L1ToL2MessageSource>(
    url,
    {
      ContractData,
      EncodedContractFunction,
      EthAddress,
      ExtendedContractData,
      ExtendedUnencryptedL2Log,
      Fr,
      L1ToL2Message,
      L2Block,
      L2BlockL2Logs,
    },
    {},
    false,
    fetch,
  );
