import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { DeployOptions } from '@aztec/aztec.js/contracts';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { encodeArgs, getContractArtifact, prettyPrintJSON } from '@aztec/cli/utils';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { getAllFunctionAbis, getInitializer } from '@aztec/stdlib/abi';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { TxStatus } from '@aztec/stdlib/tx';

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
  waitForStatus: TxStatus,
  verbose: boolean,
  timeout: number = DEFAULT_TX_TIMEOUT_S,
  debugLogger: Logger,
  log: LogFn,
  universal?: boolean,
) {
  const out: Record<string, any> = {};
  salt ??= Fr.random();
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const hasInitializer = getAllFunctionAbis(contractArtifact).some(fn => fn.isInitializer);
  const constructorArtifact = hasInitializer ? getInitializer(contractArtifact, initializer) : undefined;

  // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?

  const contractDeployer = new ContractDeployer(contractArtifact, wallet, initializer);

  let args = [];
  if (rawArgs.length > 0) {
    if (!constructorArtifact) {
      throw new Error(`Cannot process constructor arguments as no constructor was found`);
    }
    debugLogger.debug(`Input arguments: ${rawArgs.map((x: any) => `"${x}"`).join(', ')}`);
    args = encodeArgs(rawArgs, constructorArtifact!.parameters);
    debugLogger.debug(`Encoded arguments: ${args.join(', ')}`);
  }

  const deployInteraction = contractDeployer.deploy(args, {
    salt,
    publicKeys: publicKeys ?? PublicKeys.default(),
    ...(universal ? { universalDeploy: true as const } : {}),
  });
  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, deployer);
  const deployOpts: DeployOptions = {
    fee: { gasSettings, paymentMethod },
    from: deployer ?? NO_FROM,
    skipClassPublication,
    skipInitialization,
    skipInstancePublication,
  };

  const localStart = performance.now();
  const sim = await deployInteraction.simulate({
    ...deployOpts,
    includeMetadata: true,
  });
  // includeMetadata: true guarantees these fields are present
  const estimatedGas = await wallet.estimateGasLimits(sim.gasUsed!);
  const stats = sim.stats!;

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
    if (verbose) {
      printProfileResult(stats, log);
    }

    const instance = await deployInteraction.getInstance();
    const address = instance.address;
    const partialAddress = await deployInteraction.getPartialAddress();

    const { txHash } = await deployInteraction.send({ ...deployOpts, wait: NO_WAIT });
    const localTimeMs = performance.now() - localStart;
    debugLogger.debug(`Deploy tx sent with hash ${txHash.toString()}`);
    out.hash = txHash;

    if (wait) {
      const nodeStart = performance.now();
      const receipt = await waitForTx(node, txHash, { timeout, waitForStatus });
      const nodeTimeMs = performance.now() - nodeStart;

      if (!json) {
        log(`Contract deployed at ${address.toString()}`);
        log(`Contract partial address ${partialAddress.toString()}`);
        log(`Contract init hash ${instance.initializationHash.toString()}`);
        log(`Deployment tx hash: ${txHash.toString()}`);
        log(`Deployment salt: ${salt.toString()}`);
        log(`Deployer: ${instance.deployer.toString()}`);
        log(`Transaction fee: ${receipt.transactionFee?.toString()}`);
        log(` Local processing time: ${(localTimeMs / 1000).toFixed(1)}s`);
        log(` Node inclusion time: ${(nodeTimeMs / 1000).toFixed(1)}s`);
      } else {
        out.contract = {
          address: address.toString(),
          partialAddress: partialAddress.toString(),
          initializationHash: instance.initializationHash.toString(),
          salt: salt.toString(),
          transactionFee: receipt.transactionFee?.toString(),
        };
      }
    } else {
      if (!json) {
        log(`Contract deployed at ${address.toString()}`);
        log(`Contract partial address ${partialAddress.toString()}`);
        log(`Contract init hash ${instance.initializationHash.toString()}`);
        log(`Deployment tx hash: ${txHash.toString()}`);
        log(`Deployment salt: ${salt.toString()}`);
        log(`Deployer: ${instance.deployer.toString()}`);
      } else {
        out.contract = {
          address: address.toString(),
          partialAddress: partialAddress.toString(),
          initializationHash: instance.initializationHash.toString(),
          salt: salt.toString(),
        };
      }
    }
  }
  if (json) {
    log(prettyPrintJSON(out));
  }
  return await deployInteraction.getAddress();
}
