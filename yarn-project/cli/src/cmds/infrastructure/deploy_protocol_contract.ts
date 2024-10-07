import { SignerlessWallet, type WaitOpts, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type LogFn } from '@aztec/foundation/log';

import { deployCanonicalAuthRegistry, deployCanonicalL2FeeJuice } from '../misc/deploy_contracts.js';

const waitOpts: WaitOpts = {
  timeout: 180,
  interval: 1,
  proven: true,
  provenTimeout: 600,
};

export async function deployProtocolContracts(rpcUrl: string, l1ChainId: number, json: boolean, log: LogFn) {
  log('deployProtocolContracts: Creating PXE client...');
  const pxe = createPXEClient(rpcUrl, makeFetch([], true));
  const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(l1ChainId, 1));

  log('deployProtocolContracts: Deploying canonical auth registry...');
  // Deploy Auth Registry
  const authRegistryAddress = await deployCanonicalAuthRegistry(deployer, waitOpts);

  log('deployProtocolContracts: Getting fee juice portal address...');
  // Deploy Fee Juice
  const feeJuicePortalAddress = (await deployer.getNodeInfo()).l1ContractAddresses.feeJuicePortalAddress;
  log('deployProtocolContracts: Deploying fee juice portal...');
  const feeJuiceAddress = await deployCanonicalL2FeeJuice(deployer, feeJuicePortalAddress, waitOpts, log);

  if (json) {
    log(
      JSON.stringify(
        {
          authRegistryAddress: authRegistryAddress.toString(),
          feeJuiceAddress: feeJuiceAddress.toString(),
        },
        null,
        2,
      ),
    );
  } else {
    log(`Auth Registry: ${authRegistryAddress}`);
    log(`Fee Juice: ${feeJuiceAddress}`);
  }
}