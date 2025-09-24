import { AztecAddress, type DeployOptions, ProtocolContractAddress } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn, Logger } from '@aztec/foundation/log';

import type { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function deployAccount(
  wallet: CLIWallet,
  address: AztecAddress,
  wait: boolean,
  registerClass: boolean,
  publicDeploy: boolean,
  feeOpts: CLIFeeArgs,
  json: boolean,
  verbose: boolean,
  debugLogger: Logger,
  log: LogFn,
) {
  const out: Record<string, any> = {};

  const account = await wallet.createOrRetrieveAccount(address);
  const { partialAddress, publicKeys } = await account.getCompleteAddress();
  const { initializationHash, deployer, salt } = account.getInstance();

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
    log(`Deployer:        ${deployer.toString()}`);
  }

  let tx;
  let txReceipt;

  const userFeeOptions = await feeOpts.toUserFeeOptions(wallet, address);
  const feePayer = await userFeeOptions.paymentMethod?.getFeePayer();
  let paymentAsset;
  try {
    paymentAsset = await userFeeOptions.paymentMethod?.getAsset();
    // eslint-disable-next-line no-empty
  } catch {}

  // If someone else is paying the fee, set them as the deployment account.
  // What we're trying to identify here is that the fee payment method is
  // FeeJuicePaymentMethod(anAddressThatsNotTheAccountBeingDeployed)
  const delegatedDeployment =
    paymentAsset?.equals(ProtocolContractAddress.FeeJuice) && !feePayer?.equals(account.getAddress());
  const from = delegatedDeployment ? feePayer! : AztecAddress.ZERO;

  const deployOpts: DeployOptions = {
    skipInstancePublication: !publicDeploy,
    skipClassPublication: !registerClass,
    from,
    fee: userFeeOptions,
    // Do not mix the deployer in the address, since the account
    // was created (and thus its address was fixed) like this
    universalDeploy: true,
    contractAddressSalt: salt,
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
    !delegatedDeployment && deployOpts?.fee
      ? { ...deployOpts.fee, paymentMethod: await account.getSelfPaymentMethod(deployOpts.fee.paymentMethod) }
      : deployOpts?.fee;

  const deployMethod = await account.getDeployMethod();
  const { estimatedGas } = await deployMethod.simulate({
    ...deployOpts,
    fee: { ...deployOpts.fee, estimateGas: true },
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
      ...deployOpts,
      fee: {
        ...deployOpts.fee,
        gasSettings: estimatedGas,
      },
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
