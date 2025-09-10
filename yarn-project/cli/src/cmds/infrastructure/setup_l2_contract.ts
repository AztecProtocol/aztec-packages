import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AccountManager, type AztecAddress, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { TestWallet, deployFundedSchnorrAccounts } from '@aztec/test-wallet';

import { setupSponsoredFPC } from '../../utils/setup_contracts.js';

export async function setupL2Contracts(
  rpcUrl: string,
  testAccounts: boolean,
  sponsoredFPC: boolean,
  json: boolean,
  log: LogFn,
) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
  };
  log('setupL2Contracts: Wait options' + jsonStringify(waitOpts));
  log('setupL2Contracts: Creating PXE client...');
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([1, 1, 1, 1, 1], false));
  const wallet = new TestWallet(pxe);

  let deployedAccountManagers: AccountManager[] = [];
  if (testAccounts) {
    log('setupL2Contracts: Deploying test accounts...');
    const initialAccountsData = await getInitialTestAccountsData();
    deployedAccountManagers = await deployFundedSchnorrAccounts(wallet, initialAccountsData, waitOpts);
  }

  if (sponsoredFPC) {
    log('setupL2Contracts: Setting up sponsored FPC...');
    await setupSponsoredFPC(pxe, log);
  }

  if (json) {
    const toPrint: Record<string, AztecAddress> = { ...ProtocolContractAddress };
    deployedAccountManagers.forEach((a, i) => {
      toPrint[`testAccount${i}`] = a.getAddress();
    });
    log(JSON.stringify(toPrint, null, 2));
  }
}
