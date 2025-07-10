import type { AccountManager, DeployAccountOptions } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { type IFeeOpts, printGasEstimates } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';

export async function deployAccount(
  account: AccountManager,
  wait: boolean,
  registerClass: boolean,
  publicDeploy: boolean,
  feeOpts: IFeeOpts,
  json: boolean,
  verbose: boolean,
  debugLogger: Logger,
  log: LogFn,
) {
  const out: Record<string, any> = {};
  const { address, partialAddress, publicKeys } = await account.getCompleteAddress();
  const { initializationHash, deployer, salt } = account.getInstance();
  const wallet = await account.getWallet();
  const secretKey = wallet.getSecretKey();

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
    if (secretKey) {
      log(`Secret key:     ${secretKey.toString()}`);
    }
    log(`Partial address: ${partialAddress.toString()}`);
    log(`Salt:            ${salt.toString()}`);
    log(`Init hash:       ${initializationHash.toString()}`);
    log(`Deployer:        ${deployer.toString()}`);
  }

  let tx;
  let txReceipt;

  const deployOpts: DeployAccountOptions = {
    skipInstancePublication: !publicDeploy,
    skipClassPublication: !registerClass,
    ...(await feeOpts.toDeployAccountOpts(wallet)),
  };

  /*
   * This is usually handled by accountManager.deploy(), but we're accessing the lower
   * level method to get gas and timings. That means we have to replicate some of the logic here.
   * In case we're deploying our own account, we need to hijack the payment method for the fee,
   * wrapping it in the one that will make use of the freshly deployed account's
   * entrypoint. For reference, see aztec.js/src/account_manager.ts:deploy()
   * Also, salt and universalDeploy have to be explicitly provided
   */
  deployOpts.fee =
    !deployOpts?.deployWallet && deployOpts?.fee
      ? { ...deployOpts.fee, paymentMethod: await account.getSelfPaymentMethod(deployOpts.fee.paymentMethod) }
      : deployOpts?.fee;

  const deployMethod = await account.getDeployMethod(deployOpts.deployWallet);

  if (feeOpts.estimateOnly) {
    const gas = await deployMethod.estimateGas({ ...deployOpts, universalDeploy: true, contractAddressSalt: salt });
    if (json) {
      out.fee = {
        gasLimits: {
          da: gas.gasLimits.daGas,
          l2: gas.gasLimits.l2Gas,
        },
        teardownGasLimits: {
          da: gas.teardownGasLimits.daGas,
          l2: gas.teardownGasLimits,
        },
      };
    } else {
      printGasEstimates(feeOpts, gas, log);
    }
  } else {
    const provenTx = await deployMethod.prove({ ...deployOpts, universalDeploy: true, contractAddressSalt: salt });
    if (verbose) {
      printProfileResult(provenTx.stats!, log);
    }
    tx = provenTx.send();

    const txHash = await tx.getTxHash();
    debugLogger.debug(`Account contract tx sent with hash ${txHash}`);
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
      log(`Deploy tx hash:  ${await tx.getTxHash()}`);
    }
    if (txReceipt) {
      log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
    }
  }

  return { address, secretKey, salt };
}
