import { type InitialAccountData, deployFundedSchnorrAccounts, getInitialTestAccounts } from '@aztec/accounts/testing';
import { type AztecAddress, SignerlessWallet, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { setupCanonicalL2FeeJuice } from '../misc/setup_contracts.js';

export async function setupL2Contracts(
  rpcUrl: string,
  testAccounts: boolean,
  json: boolean,
  skipProofWait: boolean,
  log: LogFn,
) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
    proven: !skipProofWait,
    provenTimeout: 600,
  };
  log('setupL2Contracts: Wait options' + jsonStringify(waitOpts));
  log('setupL2Contracts: Creating PXE client...');
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([1, 1, 1, 1, 1], false));
  const wallet = new SignerlessWallet(pxe);

  log('setupL2Contracts: Getting fee juice portal address...');
  // Deploy Fee Juice
  const feeJuicePortalAddress = (await wallet.getNodeInfo()).l1ContractAddresses.feeJuicePortalAddress;
  log('setupL2Contracts: Setting up fee juice portal...');
  await setupCanonicalL2FeeJuice(wallet, feeJuicePortalAddress, waitOpts, log);

  let deployedAccounts: InitialAccountData[] = [];
  if (testAccounts) {
    log('setupL2Contracts: Deploying test accounts...');
    deployedAccounts = await getInitialTestAccounts();
    await deployFundedSchnorrAccounts(pxe, deployedAccounts, waitOpts);
  }

  if (json) {
    const toPrint: Record<string, AztecAddress> = { ...ProtocolContractAddress };
    deployedAccounts.forEach((a, i) => {
      toPrint[`testAccount${i}`] = a.address;
    });
    log(JSON.stringify(toPrint, null, 2));
  }
}
