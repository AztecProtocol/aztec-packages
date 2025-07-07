import { type AccountWalletWithSecretKey, ContractDeployer, type DeployOptions, Fr } from '@aztec/aztec.js';
import { encodeArgs, getContractArtifact } from '@aztec/cli/utils';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { getAllFunctionAbis, getInitializer } from '@aztec/stdlib/abi';
import { PublicKeys } from '@aztec/stdlib/keys';

import { type IFeeOpts, printGasEstimates } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';

export async function deploy(
  wallet: AccountWalletWithSecretKey,
  artifactPath: string,
  json: boolean,
  publicKeys: PublicKeys | undefined,
  rawArgs: any[],
  salt: Fr | undefined,
  initializer: string | undefined,
  skipPublicDeployment: boolean,
  skipClassRegistration: boolean,
  skipInitialization: boolean | undefined,
  universalDeploy: boolean | undefined,
  wait: boolean,
  feeOpts: IFeeOpts,
  verbose: boolean,
  timeout: number = DEFAULT_TX_TIMEOUT_S,
  debugLogger: Logger,
  log: LogFn,
  logJson: (output: any) => void,
) {
  salt ??= Fr.random();
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const hasInitializer = getAllFunctionAbis(contractArtifact).some(fn => fn.isInitializer);
  const constructorArtifact = hasInitializer ? getInitializer(contractArtifact, initializer) : undefined;

  // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?

  const deployer = new ContractDeployer(contractArtifact, wallet, publicKeys ?? PublicKeys.default(), initializer);

  let args = [];
  if (rawArgs.length > 0) {
    if (!constructorArtifact) {
      throw new Error(`Cannot process constructor arguments as no constructor was found`);
    }
    debugLogger.debug(`Input arguments: ${rawArgs.map((x: any) => `"${x}"`).join(', ')}`);
    args = encodeArgs(rawArgs, constructorArtifact!.parameters);
    debugLogger.debug(`Encoded arguments: ${args.join(', ')}`);
  }

  const deploy = deployer.deploy(...args);
  const deployOpts: DeployOptions = {
    ...(await feeOpts.toDeployAccountOpts(wallet)),
    contractAddressSalt: salt,
    universalDeploy,
    skipClassRegistration,
    skipInitialization,
    skipPublicDeployment,
  };

  if (feeOpts.estimateOnly) {
    const gas = await deploy.estimateGas(deployOpts);
    printGasEstimates(feeOpts, gas, log);
    return;
  }

  const provenTx = await deploy.prove(deployOpts);
  if (verbose) {
    printProfileResult(provenTx.stats!, log);
  }

  const tx = provenTx.send();

  const txHash = await tx.getTxHash();
  debugLogger.debug(`Deploy tx sent with hash ${txHash}`);
  if (wait) {
    const deployed = await tx.wait({ timeout });
    const { address, partialAddress, instance } = deployed.contract;
    if (json) {
      logJson({
        address: address.toString(),
        partialAddress: (await partialAddress).toString(),
        initializationHash: instance.initializationHash.toString(),
        salt: salt.toString(),
        transactionFee: deployed.transactionFee?.toString(),
      });
    } else {
      log(`Contract deployed at ${address.toString()}`);
      log(`Contract partial address ${(await partialAddress).toString()}`);
      log(`Contract init hash ${instance.initializationHash.toString()}`);
      log(`Deployment tx hash: ${txHash.toString()}`);
      log(`Deployment salt: ${salt.toString()}`);
      log(`Deployment fee: ${deployed.transactionFee}`);
    }
  } else {
    const { address, partialAddress } = deploy;
    const instance = await deploy.getInstance();
    if (json) {
      logJson({
        address: address?.toString() ?? 'N/A',
        partialAddress: (await partialAddress)?.toString() ?? 'N/A',
        txHash: txHash.toString(),
        initializationHash: instance.initializationHash.toString(),
        salt: salt.toString(),
        deployer: instance.deployer.toString(),
      });
    } else {
      log(`Contract deployed at ${address?.toString()}`);
      log(`Contract partial address ${(await partialAddress)?.toString()}`);
      log(`Contract init hash ${instance.initializationHash.toString()}`);
      log(`Deployment tx hash: ${txHash.toString()}`);
      log(`Deployment salt: ${salt.toString()}`);
      log(`Deployer: ${instance.deployer.toString()}`);
    }
  }
  return deploy.address;
}
