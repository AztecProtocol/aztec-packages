import { SignerlessWallet, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { setupCanonicalL2FeeJuice } from '../misc/setup_contracts.js';

const waitOpts: WaitOpts = {
  timeout: 180,
  interval: 1,
  proven: true,
  provenTimeout: 600,
};

export async function setupProtocolContracts(rpcUrl: string, l1ChainId: number, json: boolean, log: LogFn) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  // const { TokenContract } = await import('@aztec/noir-contracts.js');
  const pxe = createPXEClient(rpcUrl, makeFetch([], true));
  const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(l1ChainId, 1));

  // Setup Fee Juice
  const feeJuicePortalAddress = (await deployer.getNodeInfo()).l1ContractAddresses.feeJuicePortalAddress;
  await setupCanonicalL2FeeJuice(deployer, feeJuicePortalAddress, waitOpts);

  if (json) {
    log(JSON.stringify(ProtocolContractAddress, null, 2));
  }
}
