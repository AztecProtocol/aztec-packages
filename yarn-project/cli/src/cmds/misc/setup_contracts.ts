import { DefaultWaitOpts, type EthAddress, NoFeePaymentMethod, type Wallet } from '@aztec/aztec.js';
import { FEE_JUICE_INITIAL_MINT, Gas } from '@aztec/circuits.js';
import { type LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

/**
 * Deploys the contract to pay for gas on L2.
 */
export async function setupCanonicalL2FeeJuice(
  deployer: Wallet,
  feeJuicePortalAddress: EthAddress,
  waitOpts = DefaultWaitOpts,
  log: LogFn,
) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FeeJuiceContract } = await import('@aztec/noir-contracts.js/FeeJuice');

  const feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, deployer);

  const portalAddress = await deployer.getPublicStorageAt(
    feeJuiceContract.address,
    feeJuiceContract.artifact.storageLayout.portal_address.slot,
  );

  if (portalAddress.isZero()) {
    log('setupCanonicalL2FeeJuice: Calling initialize on fee juice contract...');
    await feeJuiceContract.methods
      .initialize(feeJuicePortalAddress, FEE_JUICE_INITIAL_MINT)
      .send({ fee: { paymentMethod: new NoFeePaymentMethod(), gasSettings: { teardownGasLimits: Gas.empty() } } })
      .wait(waitOpts);
  } else {
    log(
      'setupCanonicalL2FeeJuice: Fee juice contract already initialized. Fee Juice Portal address: ' +
        portalAddress.toString(),
    );
  }
}
