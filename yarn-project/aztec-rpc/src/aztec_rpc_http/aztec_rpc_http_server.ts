import http from 'http';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { TxHash } from '@aztec/types';
import { JsonRpcServer } from '@aztec/foundation/json-rpc';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
// import { Grumpkin } from "@aztec/circuits.js/barretenberg";
import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';

import { EthAddress, createAztecRPCServer } from '../index.js';
import { deployL1Contracts } from '@aztec/ethereum';
// import { MemoryDB } from '../database/memory_db.js';

const { NUM_OF_ACCOUNTS } = process.env;

const MNEMONIC = 'test test test test test test test test test test test junk';

const logger = createDebugLogger('aztec:http_rpc_server');

export const localAnvil = foundry;

/**
 * Wraps an instance of the Aztec RPC Server implementation to a JSON RPC HTTP interface.
 * @returns A new instance of the HTTP server.
 */
export async function getHttpRpcServer(): Promise<JsonRpcServer> {
  const aztecNodeConfig: AztecNodeConfig = getConfigEnvVars();

  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;
  const deployedL1Contracts = await deployL1Contracts(aztecNodeConfig.rpcUrl, hdAccount, localAnvil, logger);
  aztecNodeConfig.publisherPrivateKey = Buffer.from(privKey!);
  aztecNodeConfig.rollupContract = deployedL1Contracts.rollupAddress;
  aztecNodeConfig.contractDeploymentEmitterContract = deployedL1Contracts.contractDeploymentEmitterAddress;
  aztecNodeConfig.inboxContract = deployedL1Contracts.inboxAddress;

  const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig);
  const aztecRpcServer = await createAztecRPCServer(aztecNode);
  const generatedRpcServer = new JsonRpcServer(aztecRpcServer, { AztecAddress, TxHash, EthAddress, Point, Fr }, false, [
    'start',
    'stop',
  ]);
  return generatedRpcServer;
  // httpServer.listen(SERVER_PORT);
  // logger(`Aztec RPC HTTP Server listening on port: ${SERVER_PORT}`);
}
