import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AuthRegistryArtifact, getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

export async function publishStandardAuthRegistry(wallet: Wallet, from: AztecAddress): Promise<void> {
  const { instance, contractClass } = await getStandardAuthRegistry();
  if (!(await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered) {
    await (await publishContractClass(wallet, AuthRegistryArtifact)).send({ from });
  }
  if (!(await wallet.getContractMetadata(instance.address)).isContractPublished) {
    await publishInstance(wallet, instance).send({ from });
  }
}
