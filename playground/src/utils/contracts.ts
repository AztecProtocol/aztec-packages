import { AztecAddress, type Wallet } from '@aztec/aztec.js';

export async function filterDeployedAliasedContracts(
  aliasedContracts: { key: string; value: string }[],
  wallet: Wallet,
) {
  const deployed = (
    await Promise.all(
      aliasedContracts.map(async alias => {
        const { isContractPublished } = await wallet.getContractMetadata(
          AztecAddress.fromString(alias.value),
        );
        return { ...alias, deployed: isContractPublished };
      }),
    )
  ).filter(contract => contract.deployed);
  return deployed;
}
