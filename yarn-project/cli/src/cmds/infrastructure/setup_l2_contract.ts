import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AccountManager, type AztecAddress, type WaitOpts, createAztecNodeClient } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { TestWallet, deployFundedSchnorrAccounts } from '@aztec/test-wallet/server';

export async function setupL2Contracts(nodeUrl: string, testAccounts: boolean, json: boolean, log: LogFn) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
  };
  log('setupL2Contracts: Wait options' + jsonStringify(waitOpts));
  log('setupL2Contracts: Creating PXE client...');
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(node);

  let deployedAccountManagers: AccountManager[] = [];
  if (testAccounts) {
    log('setupL2Contracts: Deploying test accounts...');
    const initialAccountsData = await getInitialTestAccountsData();
    deployedAccountManagers = await deployFundedSchnorrAccounts(wallet, node, initialAccountsData, waitOpts);
  }

  if (json) {
    const toPrint: Record<string, AztecAddress> = { ...ProtocolContractAddress };
    deployedAccountManagers.forEach((a, i) => {
      toPrint[`testAccount${i}`] = a.address;
    });
    log(JSON.stringify(toPrint, null, 2));
  }
}
