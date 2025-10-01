import { AztecAddress, type AztecNode, type DeployAccountOptions } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function deployAccount(
  wallet: CLIWallet,
  aztecNode: AztecNode,
  address: AztecAddress,
  wait: boolean,
  deployer: AztecAddress | undefined,
  registerClass: boolean,
  publicDeploy: boolean,
  skipInitialization: boolean,
  feeOpts: CLIFeeArgs,
  json: boolean,
  verbose: boolean,
  debugLogger: Logger,
  log: LogFn,
) {
  const out: Record<string, any> = {};

  const account = await wallet.createOrRetrieveAccount(address);
  const { partialAddress, publicKeys } = await account.getCompleteAddress();
  const { initializationHash, salt } = account.getInstance();

  if (json) {
    out.address = address;
    out.partialAddress = partialAddress;
    out.salt = salt;
    out.initHash = initializationHash;
    out.deployer = deployer;
  } else {
    log(`\nNew account:\n`);
    log(`Address:         ${address.toString()}`);
    log(`Public key:      ${publicKeys.toString()}`);
    log(`Partial address: ${partialAddress.toString()}`);
    log(`Salt:            ${salt.toString()}`);
    log(`Init hash:       ${initializationHash.toString()}`);
  }

  let tx;
  let txReceipt;
  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(aztecNode, wallet, address);

  const delegatedDeployment = deployer && !account.address.equals(deployer);
  const from = delegatedDeployment ? deployer : AztecAddress.ZERO;

  const deployAccountOpts: DeployAccountOptions = {
    skipClassPublication: !registerClass,
    skipInstancePublication: !publicDeploy,
    skipInitialization,
    from,
    fee: { paymentMethod, gasSettings },
  };

  const deployMethod = await account.getDeployMethod();
  const { estimatedGas } = await deployMethod.simulate({
    ...deployAccountOpts,
    fee: { ...deployAccountOpts.fee, estimateGas: true },
  });

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
    const provenTx = await deployMethod.prove({
      ...deployAccountOpts,
      fee: deployAccountOpts.fee
        ? {
            ...deployAccountOpts.fee,
            gasSettings: estimatedGas,
          }
        : undefined,
    });
    if (verbose) {
      printProfileResult(provenTx.stats!, log);
    }
    tx = provenTx.send();

    const txHash = await tx.getTxHash();
    debugLogger.debug(`Account contract tx sent with hash ${txHash.toString()}`);
    out.txHash = txHash;
    if (wait) {
      if (!json) {
        log(`\nWaiting for account contract deployment...`);
      }
      txReceipt = await tx.wait({ timeout: DEFAULT_TX_TIMEOUT_S });
      out.txReceipt = {
        status: txReceipt.status,
        transactionFee: txReceipt.transactionFee,
      };
    }
  }

  if (json) {
    log(prettyPrintJSON(out));
  } else {
    if (tx) {
      log(`Deploy tx hash:  ${(await tx.getTxHash()).toString()}`);
    }
    if (txReceipt) {
      log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
    }
  }
}
