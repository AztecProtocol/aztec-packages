import { AztecAddress, type Wallet } from '@aztec/aztec.js';

export async function filterDeployedAliasedContracts(
  aliasedContracts: { alias: string; item: string }[],
  wallet: Wallet,
) {
  const deployed = (
    await Promise.all(
      aliasedContracts.map(async contract => {
        const { isContractPublished } = await wallet.getContractMetadata(AztecAddress.fromString(contract.item));
        return { ...contract, deployed: isContractPublished };
      }),
    )
  ).filter(contract => contract.deployed);
  return deployed;
}
