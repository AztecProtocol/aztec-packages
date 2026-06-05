import type { WaitOpts } from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AuthRegistryArtifact, getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

export async function publishStandardAuthRegistry(
  wallet: Wallet,
  from: AztecAddress,
  waitOpts?: WaitOpts,
): Promise<void> {
  const { instance, contractClass } = await getStandardAuthRegistry();
  if (!(await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered) {
    await (await publishContractClass(wallet, AuthRegistryArtifact)).send({ from, wait: waitOpts });
  }
  if (!(await wallet.getContractMetadata(instance.address)).isContractPublished) {
    await publishInstance(wallet, instance).send({ from, wait: waitOpts });
  }
}
