import { SchnorrAccountContractArtifact, getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import {
  type AztecAddress,
  BatchCall,
  type CompleteAddress,
  type DebugLogger,
  EthCheatCodes,
  GrumpkinPrivateKey,
  type Wallet,
} from '@aztec/aztec.js';
import { deployInstance, registerContractClass } from '@aztec/aztec.js/deployment';
import { asyncMap } from '@aztec/foundation/async-map';
import { reviver } from '@aztec/foundation/serialize';
import { type PXEService, createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { type Anvil, createAnvil } from '@viem/anvil';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { copySync, removeSync } from 'fs-extra/esm';
import getPort from 'get-port';
import { join } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from './fixtures.js';
import { getACVMConfig } from './get_acvm_config.js';
import { setupL1Contracts } from './setup_l1_contracts.js';

type SubsystemsContext = {
  anvil: Anvil;
  acvmConfig: any;
  aztecNode: AztecNodeService;
  aztecNodeConfig: AztecNodeConfig;
  pxe: PXEService;
};

type SnapshotEntry = {
  name: string;
  apply: (context: SubsystemsContext, logger: DebugLogger) => Promise<any>;
  restore: (snapshotData: any, context: SubsystemsContext, logger: DebugLogger) => Promise<any>;
  snapshotPath: string;
};

export class SnapshotManager {
  private snapshotStack: SnapshotEntry[] = [];
  private context?: SubsystemsContext;
  private livePath: string;

  constructor(private testName: string, private dataPath: string, private logger: DebugLogger) {
    this.livePath = join(this.dataPath, 'live', this.testName);
  }

  public async snapshot<T, U>(
    name: string,
    apply: (context: SubsystemsContext, logger: DebugLogger) => Promise<T>,
    restore: (snapshotData: T, context: SubsystemsContext, logger: DebugLogger) => Promise<U>,
  ) {
    const snapshotPath = join(this.dataPath, 'snapshots', ...this.snapshotStack.map(e => e.name), name, 'snapshot');

    if (existsSync(snapshotPath)) {
      // Snapshot exists. Delay creating subsystems as we're probably still descending the tree.
      this.logger(`Snapshot exists at ${snapshotPath}. Continuing...`);
      this.snapshotStack.push({ name, apply, restore, snapshotPath });
      return;
    }

    // Snapshot doesn't exist, and by definition none of the child snapshots can exist.
    if (!this.context) {
      // We have no context yet, create from the previous snapshot if it exists.
      this.context = await this.setup();
    }

    this.snapshotStack.push({ name, apply, restore, snapshotPath });

    // Apply current state transition.
    this.logger(`Applying state transition for ${name}...`);
    const snapshotData = await apply(this.context, this.logger);

    // Execute the restoration function.
    await restore(snapshotData, this.context, this.logger);

    // Save the snapshot data.
    const ethCheatCodes = new EthCheatCodes(this.context.aztecNodeConfig.rpcUrl);
    const anvilStateFile = `${this.livePath}/anvil.dat`;
    await ethCheatCodes.dumpChainState(anvilStateFile);
    writeFileSync(`${this.livePath}/${name}.json`, JSON.stringify(snapshotData));

    // Copy everything to snapshot path.
    this.logger(`Saving snapshot to ${snapshotPath}...`);
    mkdirSync(snapshotPath, { recursive: true });
    copySync(this.livePath, snapshotPath);
  }

  public async setup() {
    // We have no context yet, create from the last snapshot if it exists.
    if (!this.context) {
      removeSync(this.livePath);
      mkdirSync(this.livePath, { recursive: true });
      const previousSnapshotPath = this.snapshotStack[this.snapshotStack.length - 1]?.snapshotPath;
      if (previousSnapshotPath) {
        this.logger(`Copying snapshot from ${previousSnapshotPath} to ${this.livePath}...`);
        copySync(previousSnapshotPath, this.livePath);
        this.context = await this.setupFromState(this.livePath);
        // Execute each of the previous snapshots restoration functions in turn.
        await asyncMap(this.snapshotStack, async e => {
          const snapshotData = JSON.parse(readFileSync(`${e.snapshotPath}/${e.name}.json`, 'utf-8'), reviver);
          this.logger(`Executing restoration function for ${e.name}...`);
          await e.restore(snapshotData, this.context!, this.logger);
        });
      } else {
        this.context = await this.setupFromFresh(this.livePath);
      }
    }
    return this.context;
  }

  public async pop() {
    this.snapshotStack.pop();
    await this.teardown();
  }

  public async teardown() {
    if (!this.context) {
      return;
    }
    await this.context.aztecNode.stop();
    await this.context.pxe.stop();
    await this.context.acvmConfig?.cleanup();
    await this.context.anvil.stop();
    this.context = undefined;
  }

  private async setupFromFresh(livePath?: string): Promise<SubsystemsContext> {
    this.logger(`Initializing state...`);

    // Fetch the AztecNode config.
    // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
    const aztecNodeConfig: AztecNodeConfig = getConfigEnvVars();
    aztecNodeConfig.dataDirectory = livePath;

    // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
    this.logger('Starting anvil...');
    const ethereumHostPort = await getPort();
    aztecNodeConfig.rpcUrl = `http://localhost:${ethereumHostPort}`;
    const anvil = createAnvil({ anvilBinary: './scripts/anvil_kill_wrapper.sh', port: ethereumHostPort });
    await anvil.start();

    // Deploy our L1 contracts.
    this.logger('Deploying L1 contracts...');
    const hdAccount = mnemonicToAccount(MNEMONIC);
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    const publisherPrivKey = privKeyRaw === null ? null : Buffer.from(privKeyRaw);
    const deployL1ContractsValues = await setupL1Contracts(aztecNodeConfig.rpcUrl, hdAccount, this.logger);
    aztecNodeConfig.publisherPrivateKey = `0x${publisherPrivKey!.toString('hex')}`;
    aztecNodeConfig.l1Contracts = deployL1ContractsValues.l1ContractAddresses;
    aztecNodeConfig.l1BlockPublishRetryIntervalMS = 100;

    const acvmConfig = await getACVMConfig(this.logger);
    if (acvmConfig) {
      aztecNodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
      aztecNodeConfig.acvmBinaryPath = acvmConfig.expectedAcvmPath;
    }

    this.logger('Creating and synching an aztec node...');
    const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig);

    this.logger('Creating pxe...');
    const pxeConfig = getPXEServiceConfig();
    pxeConfig.dataDirectory = livePath;
    const pxe = await createPXEService(aztecNode, pxeConfig);

    writeFileSync(`${livePath}/aztec_node_config.json`, JSON.stringify(aztecNodeConfig));

    return {
      aztecNodeConfig,
      anvil,
      aztecNode,
      pxe,
      acvmConfig,
    };
  }

  /**
   * Given a statePath, setup the system starting from that state.
   */
  private async setupFromState(statePath: string): Promise<SubsystemsContext> {
    this.logger(`Initializing with saved state at ${statePath}...`);

    // Load config.
    // TODO: For some reason this is currently the union of a bunch of subsystems. That needs fixing.
    const aztecNodeConfig: AztecNodeConfig = JSON.parse(
      readFileSync(`${statePath}/aztec_node_config.json`, 'utf-8'),
      reviver,
    );
    aztecNodeConfig.dataDirectory = statePath;

    // Start anvil. We go via a wrapper script to ensure if the parent dies, anvil dies.
    const ethereumHostPort = await getPort();
    aztecNodeConfig.rpcUrl = `http://localhost:${ethereumHostPort}`;
    const anvil = createAnvil({ anvilBinary: './scripts/anvil_kill_wrapper.sh', port: ethereumHostPort });
    await anvil.start();
    // Load anvil state.
    const anvilStateFile = `${statePath}/anvil.dat`;
    const ethCheatCodes = new EthCheatCodes(aztecNodeConfig.rpcUrl);
    await ethCheatCodes.loadChainState(anvilStateFile);

    // TODO: Encapsulate this in a NativeAcvm impl.
    const acvmConfig = await getACVMConfig(this.logger);
    if (acvmConfig) {
      aztecNodeConfig.acvmWorkingDirectory = acvmConfig.acvmWorkingDirectory;
      aztecNodeConfig.acvmBinaryPath = acvmConfig.expectedAcvmPath;
    }

    this.logger('Creating aztec node...');
    const aztecNode = await AztecNodeService.createAndSync(aztecNodeConfig);

    this.logger('Creating pxe...');
    const pxeConfig = getPXEServiceConfig();
    pxeConfig.dataDirectory = statePath;
    const pxe = await createPXEService(aztecNode, pxeConfig);

    return {
      aztecNodeConfig,
      anvil,
      aztecNode,
      pxe,
      acvmConfig,
    };
  }
}

export const addAccounts =
  (numberOfAccounts: number) =>
  async ({ pxe }: SubsystemsContext, logger: DebugLogger) => {
    // Generate account keys.
    const accountKeys: [GrumpkinPrivateKey, GrumpkinPrivateKey][] = Array.from({ length: numberOfAccounts }).map(_ => [
      GrumpkinPrivateKey.random(),
      GrumpkinPrivateKey.random(),
    ]);

    logger('Simulating account deployment...');
    const accountManagers = await asyncMap(accountKeys, async ([encPk, signPk]) => {
      const account = getSchnorrAccount(pxe, encPk, signPk, 1);
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
    const txs = await Promise.all(accountManagers.map(account => account.deploy()));
    await Promise.all(txs.map(tx => tx.wait({ interval: 0.1 })));

    return { accountKeys };
  };

export async function restoreAccounts(
  { accountKeys }: Awaited<ReturnType<ReturnType<typeof addAccounts>>>,
  { pxe }: SubsystemsContext,
  logger: DebugLogger,
) {
  const accountManagers = accountKeys.map(ak => getSchnorrAccount(pxe, ak[0], ak[1], 1));
  const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
  const accounts = await pxe.getRegisteredAccounts();
  logger(`Restored ${accounts.length} accounts.`);
  return { wallets, accounts };
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
