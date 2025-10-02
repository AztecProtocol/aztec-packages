import { AztecAddress, type AztecNode, ContractDeployer, type DeployOptions, Fr } from '@aztec/aztec.js';
import { encodeArgs, getContractArtifact, prettyPrintJSON } from '@aztec/cli/utils';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { getAllFunctionAbis, getInitializer } from '@aztec/stdlib/abi';
import { PublicKeys } from '@aztec/stdlib/keys';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function deploy(
  wallet: CLIWallet,
  node: AztecNode,
  deployer: AztecAddress,
  artifactPath: string,
  json: boolean,
  publicKeys: PublicKeys | undefined,
  rawArgs: any[],
  salt: Fr | undefined,
  initializer: string | undefined,
  skipInstancePublication: boolean,
  skipClassPublication: boolean,
  skipInitialization: boolean | undefined,
  wait: boolean,
  feeOpts: CLIFeeArgs,
  verbose: boolean,
  timeout: number = DEFAULT_TX_TIMEOUT_S,
  debugLogger: Logger,
  log: LogFn,
) {
  const out: Record<string, any> = {};
  salt ??= Fr.random();
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const hasInitializer = getAllFunctionAbis(contractArtifact).some(fn => fn.isInitializer);
  const constructorArtifact = hasInitializer ? getInitializer(contractArtifact, initializer) : undefined;

  // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?

  const contractDeployer = new ContractDeployer(
    contractArtifact,
    wallet,
    publicKeys ?? PublicKeys.default(),
    initializer,
  );

  let args = [];
  if (rawArgs.length > 0) {
    if (!constructorArtifact) {
      throw new Error(`Cannot process constructor arguments as no constructor was found`);
    }
    debugLogger.debug(`Input arguments: ${rawArgs.map((x: any) => `"${x}"`).join(', ')}`);
    args = encodeArgs(rawArgs, constructorArtifact!.parameters);
    debugLogger.debug(`Encoded arguments: ${args.join(', ')}`);
  }

  const deploy = contractDeployer.deploy(...args);
  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, deployer);
  const deployOpts: DeployOptions = {
    fee: { gasSettings, paymentMethod },
    from: deployer ?? AztecAddress.ZERO,
    contractAddressSalt: salt,
    universalDeploy: !deployer,
    skipClassPublication,
    skipInitialization,
    skipInstancePublication,
  };

  const { estimatedGas } = await deploy.simulate({ ...deployOpts, fee: { ...deployOpts.fee, estimateGas: true } });

  if (feeOpts.estimateOnly) {
    if (json) {
      out.fee = {
        gasLimits: {
          da: estimatedGas.gasLimits.daGas,
          l2: estimatedGas.gasLimits.l2Gas,
        },
        teardownGasLimits: {
          da: estimatedGas.teardownGasLimits.daGas,
          l2: estimatedGas.teardownGasLimits,
        },
      };
    }
  } else {
    const provenTx = await deploy.prove(deployOpts);
    if (verbose) {
      printProfileResult(provenTx.stats!, log);
    }

    const tx = provenTx.send();

    const txHash = await tx.getTxHash();
    debugLogger.debug(`Deploy tx sent with hash ${txHash.toString()}`);
    out.hash = txHash;
    const { address, partialAddress } = deploy;
    const instance = await deploy.getInstance();
    if (!json) {
      log(`Contract deployed at ${address?.toString()}`);
      log(`Contract partial address ${(await partialAddress)?.toString()}`);
      log(`Contract init hash ${instance.initializationHash.toString()}`);
      log(`Deployment tx hash: ${txHash.toString()}`);
      log(`Deployment salt: ${salt.toString()}`);
      log(`Deployer: ${instance.deployer.toString()}`);
    } else {
      out.contract = {
        address: address?.toString(),
        partialAddress: (await partialAddress)?.toString(),
        initializationHash: instance.initializationHash.toString(),
        salt: salt.toString(),
      };
    }
    if (wait) {
      const deployed = await tx.wait({ timeout });
      if (!json) {
        log(`Transaction fee: ${deployed.transactionFee?.toString()}`);
      } else {
        out.contract.transactionFee = deployed.transactionFee?.toString();
      }
    }
  }
  if (json) {
    log(prettyPrintJSON(out));
  }
  return deploy.address;
}
