import {
  DefaultWaitOpts,
  Fr,
  type PXE,
  SignerlessWallet,
  SponsoredFeePaymentMethod,
  type WaitForProvenOpts,
  getContractInstanceFromInstantiationParams,
  waitForProven,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { LogFn } from '@aztec/foundation/log';

async function getSponsoredFPCContract() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { SponsoredFPCContract } = await import('@aztec/noir-contracts.js/SponsoredFPC');
  return SponsoredFPCContract;
}

export async function getSponsoredFPCAddress() {
  const SponsoredFPCContract = await getSponsoredFPCContract();
  const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
  return sponsoredFPCInstance.address;
}

export async function setupSponsoredFPC(
  pxe: PXE,
  log: LogFn,
  waitOpts = DefaultWaitOpts,
  waitForProvenOptions?: WaitForProvenOpts,
) {
  const SponsoredFPCContract = await getSponsoredFPCContract();
  const address = await getSponsoredFPCAddress();
  const paymentMethod = new SponsoredFeePaymentMethod(address);
  const { l1ChainId: chainId, rollupVersion } = await pxe.getNodeInfo();

  const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(chainId, rollupVersion));

  const deployTx = SponsoredFPCContract.deploy(deployer).send({
    contractAddressSalt: new Fr(SPONSORED_FPC_SALT),
    universalDeploy: true,
    fee: { paymentMethod },
  });

  const deployed = await deployTx.deployed(waitOpts);

  if (waitForProvenOptions !== undefined) {
    await waitForProven(pxe, await deployTx.getReceipt(), waitForProvenOptions);
  }

  log(`SponsoredFPC: ${deployed.address}`);
}
