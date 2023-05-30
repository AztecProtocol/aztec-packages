import { AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { deployL1Contracts } from '@aztec/ethereum';
import { mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { MNEMONIC, localAnvil } from './fixtures.js';
import { AztecRPCServer } from '@aztec/aztec.js';

/**
 * Sets up the environment for the end-to-end tests.
 * @param numberOfAccounts - The number of new accounts to be created once the RPC server is initiated.
 * @returns A tuple containing the Aztec Node service, the Aztec RPC server and a logger.
 */
export async function setup(numberOfAccounts = 1): Promise<[AztecNodeService, AztecRPCServer, DebugLogger]> {
  const config = getConfigEnvVars();

  const describeBlockName = expect.getState().currentTestName?.split(' ')[0];

  const logger = createDebugLogger('aztec:' + describeBlockName);

  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKey = hdAccount.getHdKey().privateKey;
  const { rollupAddress, unverifiedDataEmitterAddress } = await deployL1Contracts(
    config.rpcUrl,
    hdAccount,
    localAnvil,
    logger,
  );

  config.publisherPrivateKey = Buffer.from(privKey!);
  config.rollupContract = rollupAddress;
  config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;

  const node = await AztecNodeService.createAndSync(config);
  const aztecRpcServer = await createAztecRpcServer(numberOfAccounts, node);

  return [node, aztecRpcServer, logger];
}
