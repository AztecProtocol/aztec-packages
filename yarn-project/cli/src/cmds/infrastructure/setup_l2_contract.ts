import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { WaitOpts } from '@aztec/aztec.js/contracts';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { TxStatus } from '@aztec/aztec.js/tx';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { createFundedInitializerlessAccounts } from '@aztec/wallets/testing';

export async function setupL2Contracts(nodeUrl: string, testAccounts: boolean, json: boolean, log: LogFn) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
    // The embedded wallet defaults to PROPOSED, which can be dropped if its proposed block is pruned
    // before the checkpoint lands. Wait for the checkpoint so serial setup is reliable.
    waitForStatus: TxStatus.CHECKPOINTED,
  };
  log('setupL2Contracts: Wait options' + jsonStringify(waitOpts));
  log('setupL2Contracts: Creating PXE client...');
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await EmbeddedWallet.create(node);

  let accountManagers: AccountManager[] = [];
  if (testAccounts) {
    log('setupL2Contracts: Creating test accounts...');
    const initialAccountsData = await getInitialTestAccountsData();
    accountManagers = await createFundedInitializerlessAccounts(wallet, initialAccountsData);
  }

  if (json) {
    const toPrint: Record<string, AztecAddress> = { ...ProtocolContractAddress };
    accountManagers.forEach((a, i) => {
      toPrint[`testAccount${i}`] = a.address;
    });
    log(JSON.stringify(toPrint, null, 2));
  }
}
