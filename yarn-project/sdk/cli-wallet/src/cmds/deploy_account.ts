import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import type { DeployAccountOptions } from '@aztec/aztec.js/wallet';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

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
  waitForStatus: TxStatus,
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

  let txHash: TxHash | undefined;
  let txReceipt: TxReceipt | undefined;
  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(aztecNode, wallet, address);

  const delegatedDeployment = deployer && !account.address.equals(deployer);
  const from = delegatedDeployment ? deployer : NO_FROM;

  const deployAccountOpts: DeployAccountOptions = {
    skipClassPublication: !registerClass,
    skipInstancePublication: !publicDeploy,
    skipInitialization,
    from,
    fee: { paymentMethod, gasSettings },
  };

  const localStart = performance.now();
  const deployMethod = await account.getDeployMethod();
  const sim = await deployMethod.simulate({
    ...deployAccountOpts,
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

    if (!json) {
      log(`\nWaiting for account contract deployment...`);
    }
    const sendOpts = {
      ...deployAccountOpts,
      fee: deployAccountOpts.fee
        ? {
            ...deployAccountOpts.fee,
            gasSettings: estimatedGas,
          }
        : undefined,
    };

    ({ txHash } = await deployMethod.send({ ...sendOpts, wait: NO_WAIT }));
    const localTimeMs = performance.now() - localStart;

    if (wait) {
      const nodeStart = performance.now();
      txReceipt = await waitForTx(aztecNode, txHash, { timeout: DEFAULT_TX_TIMEOUT_S, waitForStatus });
      const nodeTimeMs = performance.now() - nodeStart;

      out.txReceipt = {
        status: txReceipt.status,
        transactionFee: txReceipt.transactionFee,
      };

      if (!json) {
        log(` Local processing time: ${(localTimeMs / 1000).toFixed(1)}s`);
        log(` Node inclusion time: ${(nodeTimeMs / 1000).toFixed(1)}s`);
      }
    }
    debugLogger.debug(`Account contract tx sent with hash ${txHash.toString()}`);
    out.txHash = txHash;
  }

  if (json) {
    log(prettyPrintJSON(out));
  } else {
    if (txHash) {
      log(`Deploy tx hash:  ${txHash.toString()}`);
    }
    if (txReceipt) {
      log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
    }
  }
}
