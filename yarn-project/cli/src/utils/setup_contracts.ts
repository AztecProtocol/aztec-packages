import {
  DefaultWaitOpts,
  type EthAddress,
  FeeJuicePaymentMethod,
  Fr,
  type PXE,
  SignerlessWallet,
  SponsoredFeePaymentMethod,
  type WaitForProvenOpts,
  getContractInstanceFromDeployParams,
  waitForProven,
} from '@aztec/aztec.js';
import { FEE_JUICE_INITIAL_MINT, SPONSORED_FPC_SALT } from '@aztec/constants';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { Gas } from '@aztec/stdlib/gas';

/**
 * Deploys the contract to pay for gas on L2.
 */
export async function setupCanonicalL2FeeJuice(
  pxe: PXE,
  feeJuicePortalAddress: EthAddress,
  log: LogFn,
  waitOpts = DefaultWaitOpts,
  waitForProvenOptions?: WaitForProvenOpts,
) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FeeJuiceContract } = await import('@aztec/noir-contracts.js/FeeJuice');

  const deployer = new SignerlessWallet(pxe);

  const feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, deployer);

  const portalAddress = await pxe.getPublicStorageAt(
    feeJuiceContract.address,
    feeJuiceContract.artifact.storageLayout.portal_address.slot,
  );

  if (portalAddress.isZero()) {
    log('setupCanonicalL2FeeJuice: Calling initialize on fee juice contract...');
    const paymentMethod = new FeeJuicePaymentMethod(ProtocolContractAddress.FeeJuice);
    const receipt = await feeJuiceContract.methods
      .initialize(feeJuicePortalAddress, FEE_JUICE_INITIAL_MINT)
      .send({ fee: { paymentMethod, gasSettings: { teardownGasLimits: Gas.empty() } } })
      .wait(waitOpts);
    if (waitForProvenOptions !== undefined) {
      await waitForProven(pxe, receipt, waitForProvenOptions);
    }
  } else {
    log(
      'setupCanonicalL2FeeJuice: Fee juice contract already initialized. Fee Juice Portal address: ' +
        portalAddress.toString(),
    );
  }
}

async function getSponsoredFPCContract() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { SponsoredFPCContract } = await import('@aztec/noir-contracts.js/SponsoredFPC');
  return SponsoredFPCContract;
}

export async function getSponsoredFPCAddress() {
  const SponsoredFPCContract = await getSponsoredFPCContract();
  const sponsoredFPCInstance = await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
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
