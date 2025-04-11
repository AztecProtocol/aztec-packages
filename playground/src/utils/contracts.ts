import { AztecAddress, type PXE, type Wallet } from '@aztec/aztec.js';

export async function filterDeployedAliasedContracts(
  aliasedContracts: { key: string; value: string }[],
  walletOrPxe: PXE | Wallet,
) {
  const deployed = (
    await Promise.all(
      aliasedContracts.map(async alias => {
        const { isContractPubliclyDeployed } = await walletOrPxe.getContractMetadata(
          AztecAddress.fromString(alias.value),
        );
        return { ...alias, deployed: isContractPubliclyDeployed };
      }),
    )
  ).filter(contract => contract.deployed);
  return deployed;
}
