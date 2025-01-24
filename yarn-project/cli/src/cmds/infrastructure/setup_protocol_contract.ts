import { SignerlessWallet, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { setupCanonicalL2FeeJuice } from '../misc/setup_contracts.js';

export async function setupProtocolContracts(rpcUrl: string, json: boolean, skipProofWait: boolean, log: LogFn) {
  const waitOpts: WaitOpts = {
    timeout: 180,
    interval: 1,
    proven: !skipProofWait,
    provenTimeout: 600,
  };
  log('setupProtocolContracts: Wait options' + jsonStringify(waitOpts));
  log('setupProtocolContracts: Creating PXE client...');
  const pxe = createPXEClient(rpcUrl, makeFetch([1, 1, 1, 1, 1], false));
  const wallet = new SignerlessWallet(pxe);

  log('setupProtocolContracts: Getting fee juice portal address...');
  // Deploy Fee Juice
  const feeJuicePortalAddress = (await wallet.getNodeInfo()).l1ContractAddresses.feeJuicePortalAddress;
  log('setupProtocolContracts: Setting up fee juice portal...');
  await setupCanonicalL2FeeJuice(wallet, feeJuicePortalAddress, waitOpts, log);

  if (json) {
    log(JSON.stringify(ProtocolContractAddress, null, 2));
  }
}
