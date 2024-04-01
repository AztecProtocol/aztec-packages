import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { AztecNodeService } from '@aztec/aztec-node';
import { EthCheatCodes, GrumpkinPrivateKey, createDebugLogger } from '@aztec/aztec.js';
import { reviver } from '@aztec/foundation/serialize';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { createAnvil } from '@viem/anvil';
import { readFileSync } from 'fs';
import getPort from 'get-port';

import { getACVMConfig } from './get_acvm_config.js';
import { type EndToEndSnapshotState } from './setup.js';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

/**
 * Given a statePath, setup the system starting from that state.
 */
export async function setupFromState(statePath: string, testName: string) {
  const logger = createDebugLogger('aztec:' + testName);
  logger(`Initializing with saved state at ${statePath}...`);

  // Load config.
  const { nodeConfig, accountKeys, customData }: EndToEndSnapshotState = JSON.parse(
    readFileSync(`${statePath}/config.json`, 'utf-8'),
    reviver,
  );

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  const ethereumHostPort = await getPort();
  nodeConfig.rpcUrl = `http://localhost:${ethereumHostPort}`;
  const anvil = createAnvil({ anvilBinary: './scripts/anvil_kill_wrapper.sh', port: ethereumHostPort });
  await anvil.start();
  // Load anvil state.
  const anvilStateFile = `${statePath}/anvil.dat`;
  const ethCheatCodes = new EthCheatCodes(nodeConfig.rpcUrl);
  await ethCheatCodes.loadChainState(anvilStateFile);

  // TODO: Encapsulate this in a NativeAcvm impl.
  const acvmConfig = await getACVMConfig(logger);
  if (acvmConfig) {
    nodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
    nodeConfig.acvmBinaryPath = acvmConfig.expectedAcvmPath;
  }

  logger('Creating aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(nodeConfig);
  // const sequencer = aztecNode.getSequencer();
  logger('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  const accountManagers = accountKeys.map(a =>
    getSchnorrAccount(pxe, GrumpkinPrivateKey.fromString(a[0]), GrumpkinPrivateKey.fromString(a[1])),
  );
  const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));

  const teardown = async () => {
    await aztecNode.stop();
    await pxe.stop();
    await acvmConfig?.cleanup();
    await anvil.stop();
  };

  return {
    customData,
    // aztecNode,
    // pxe,
    // deployL1ContractsValues: config.deployL1ContractsValues,
    accounts: await pxe.getRegisteredAccounts(),
    // config: nodeConfig,
    // wallet: wallets[0],
    wallets,
    logger,
    // cheatCodes,
    // sequencer,
    teardown,
  };
}
