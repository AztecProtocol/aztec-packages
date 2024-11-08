import { DefaultWaitOpts, type EthAddress, NoFeePaymentMethod, type Wallet } from '@aztec/aztec.js';
import { GasSettings } from '@aztec/circuits.js';
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
  const { FeeJuiceContract } = await import('@aztec/noir-contracts.js');

  const feeJuiceContract = await FeeJuiceContract.at(ProtocolContractAddress.FeeJuice, deployer);

  log('setupCanonicalL2FeeJuice: Calling initialize on fee juice contract...');

  try {
    const provenTx = await feeJuiceContract.methods
      .initialize(feeJuicePortalAddress)
      .prove({ fee: { paymentMethod: new NoFeePaymentMethod(), gasSettings: GasSettings.teardownless() } });

    await provenTx.send().wait(waitOpts);
  } catch (e: any) {
    if (e instanceof Error) {
      log(e.message);
    }
    log('setupCanonicalL2FeeJuice: Fee juice contract already initialized');
  }
}
