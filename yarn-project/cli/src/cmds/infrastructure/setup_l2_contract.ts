import { type InitialAccountData, deployFundedSchnorrAccounts, getInitialTestAccounts } from '@aztec/accounts/testing';
import { type AztecAddress, type WaitForProvenOpts, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { setupSponsoredFPC } from '../../utils/setup_contracts.js';

export async function setupL2Contracts(
  rpcUrl: string,
  testAccounts: boolean,
  sponsoredFPC: boolean,
  json: boolean,
  skipProofWait: boolean,
  log: LogFn,
) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
  };
  const waitForProvenOptions: WaitForProvenOpts | undefined = !skipProofWait
    ? {
        provenTimeout: 600,
      }
    : undefined;
  log('setupL2Contracts: Wait options' + jsonStringify(waitOpts));
  if (waitForProvenOptions) {
    log('setupL2Contracts: Wait for proven options' + jsonStringify(waitForProvenOptions));
  }
  log('setupL2Contracts: Creating PXE client...');
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([1, 1, 1, 1, 1], false));

  let deployedAccounts: InitialAccountData[] = [];
  if (testAccounts) {
    log('setupL2Contracts: Deploying test accounts...');
    deployedAccounts = await getInitialTestAccounts();
    await deployFundedSchnorrAccounts(pxe, deployedAccounts, waitOpts);
  }

  if (sponsoredFPC) {
    log('setupL2Contracts: Setting up sponsored FPC...');
    await setupSponsoredFPC(pxe, log, waitOpts, waitForProvenOptions);
  }

  if (json) {
    const toPrint: Record<string, AztecAddress> = { ...ProtocolContractAddress };
    deployedAccounts.forEach((a, i) => {
      toPrint[`testAccount${i}`] = a.address;
    });
    log(JSON.stringify(toPrint, null, 2));
  }
}
