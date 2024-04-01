import { SchnorrAccountContractArtifact, getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  type AztecAddress,
  BatchCall,
  type CompleteAddress,
  EthCheatCodes,
  GrumpkinPrivateKey,
  type Wallet,
  createDebugLogger,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { asyncMap } from '@aztec/foundation/async-map';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { createAnvil } from '@viem/anvil';
import { mkdirSync, writeFileSync } from 'fs';
import getPort from 'get-port';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { setupL1Contracts } from './setup_l1_contracts.js';

export interface EndToEndSnapshotState {
  nodeConfig: AztecNodeConfig;
  accountKeys: [`0x${string}`, `0x${string}`][];
  customData: { [key: string]: any };
}

/**
 * Sets up the environment for the end-to-end tests.
 * The state will be saved in statePath once the returned snapshot function is called.
 */
export async function setup(numberOfAccounts = 1, statePath: string, testName: string) {
  const logger = createDebugLogger('aztec:' + testName);
  logger(`Initializing state...`);

  // Fetch the AztecNode config.
  // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
  const config: AztecNodeConfig = getConfigEnvVars();
  config.dataDirectory = statePath;

  // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
  logger('Starting anvil...');
  const ethereumHostPort = await getPort();
  config.rpcUrl = `http://localhost:${ethereumHostPort}`;
  const anvil = createAnvil({ anvilBinary: './scripts/anvil_kill_wrapper.sh', port: ethereumHostPort });
  await anvil.start();

  // Deploy our L1 contracts.
  logger('Deploying L1 contracts...');
  const hdAccount = mnemonicToAccount(MNEMONIC);
  const privKeyRaw = hdAccount.getHdKey().privateKey;
  const publisherPrivKey = privKeyRaw === null ? null : Buffer.from(privKeyRaw);
  const deployL1ContractsValues = await setupL1Contracts(config.rpcUrl, hdAccount, logger);
  config.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
  config.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
  config.l1BlockPublishRetryIntervalMS = 100;

  const acvmConfig = await getACVMConfig(logger);
  if (acvmConfig) {
    config.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
    config.acvmBinaryPath = acvmConfig.expectedAcvmPath;
  }

  logger('Creating and synching an aztec node...');
  const aztecNode = await AztecNodeService.createAndSync(config);
  // const sequencer = aztecNode.getSequencer();

  logger('Creating pxe...');
  const pxeConfig = getPXEServiceConfig();
  pxeConfig.dataDirectory = statePath;
  const pxe = await createPXEService(aztecNode, pxeConfig);

  // Generate account keys.
  const accountKeys = Array.from({ length: numberOfAccounts }).map(_ => [
    GrumpkinPrivateKey.random(),
    GrumpkinPrivateKey.random(),
  ]);

  logger('Simulating account deployment...');
  const accounts = await asyncMap(accountKeys, async ([encPk, signPk]) => {
    const account = getSchnorrAccount(pxe, encPk, signPk);
    // Unfortunately the function below is not stateless and we call it here because it takes a long time to run and
    // the results get stored within the account object. By calling it here we increase the probability of all the
    // accounts being deployed in the same block because it makes the deploy() method basically instant.
    await account.getDeployMethod().then(d =>
      d.simulate({
        contractAddressSalt: account.salt,
        skipClassRegistration: true,
        skipPublicDeployment: true,
        universalDeploy: true,
      }),
    );
    return account;
  });

  logger('Deploying accounts...');
  const txs = await Promise.all(accounts.map(account => account.deploy()));
  await Promise.all(txs.map(tx => tx.wait({ interval: 0.1 })));
  const wallets = await Promise.all(accounts.map(account => account.getWallet()));

  // const cheatCodes = CheatCodes.create(config.rpcUrl, pxe!);

  const customData: { [key: string]: any } = {};

  const teardown = async () => {
    await aztecNode.stop();
    await pxe.stop();
    await acvmConfig?.cleanup();
    await anvil.stop();
  };

  const snapshot = async () => {
    logger(`Saving setup state to ${statePath}...`);
    mkdirSync(statePath, { recursive: true });

    const ethCheatCodes = new EthCheatCodes(config.rpcUrl);
    const anvilStateFile = `${statePath}/anvil.dat`;
    await ethCheatCodes.dumpChainState(anvilStateFile);

    const state: EndToEndSnapshotState = {
      nodeConfig: config,
      // pxeConfig: {},
      accountKeys: accountKeys.map(a => [a[0].toString(), a[1].toString()]),
      customData,
    };

    writeFileSync(`${statePath}/config.json`, JSON.stringify(state));

    // TODO: Copy lmdb state.
  };

  return {
    customData,
    // aztecNode,
    // pxe,
    // deployL1ContractsValues,
    accounts: await pxe.getRegisteredAccounts(),
    // config,
    // wallet: wallets[0],
    wallets,
    logger,
    // cheatCodes,
    // sequencer,
    teardown,
    snapshot,
  };
}

/**
 * Registers the contract class used for test accounts and publicly deploys the instances requested.
 * Use this when you need to make a public call to an account contract, such as for requesting a public authwit.
 * @param sender - Wallet to send the deployment tx.
 * @param accountsToDeploy - Which accounts to publicly deploy.
 */
export async function publicDeployAccounts(sender: Wallet, accountsToDeploy: (CompleteAddress | AztecAddress)[]) {
  const accountAddressesToDeploy = accountsToDeploy.map(a => ('address' in a ? a.address : a));
  const instances = await Promise.all(accountAddressesToDeploy.map(account => sender.getContractInstance(account)));
  const batch = new BatchCall(sender, [
    (await registerContractClass(sender, SchnorrAccountContractArtifact)).request(),
    ...instances.map(instance => deployInstance(sender, instance!).request()),
  ]);
  await batch.send().wait();
}
