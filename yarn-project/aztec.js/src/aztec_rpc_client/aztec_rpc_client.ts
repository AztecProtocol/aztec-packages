import { AztecAddress, AztecRPCServer, EthAddress, Fr, Point, Tx, TxHash } from '@aztec/aztec-rpc';
import { createJsonRpcClient } from '@aztec/foundation/json-rpc';

export const createAztecRpcClient = (url: URL) =>
  createJsonRpcClient<AztecRPCServer>(
    url.host,
    {
      AztecAddress,
      TxHash,
      EthAddress,
      Point,
      Fr,
    },
    { Tx },
    false,
  );
