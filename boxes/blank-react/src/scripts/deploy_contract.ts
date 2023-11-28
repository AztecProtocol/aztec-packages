import { AztecAddress, CompleteAddress, ContractArtifact, DeployMethod, Fr, PXE } from '@aztec/aztec.js';

export async function deployContract(
  activeWallet: CompleteAddress,
  contractArtifact: ContractArtifact,
  typedArgs: Fr[], // encode prior to passing in
  salt: Fr,
  pxe: PXE,
): Promise<AztecAddress> {
  const tx = new DeployMethod(activeWallet.publicKey, pxe, contractArtifact, typedArgs).send({
    contractAddressSalt: salt,
  });
  console.log('tx', tx);
  await tx.wait();
  console.log('tx receipt', tx.getReceipt());
  const receipt = await tx.getReceipt();
  if (receipt.contractAddress) {
    return receipt.contractAddress;
  } else {
    throw new Error(`Contract not deployed (${receipt.toJSON()})`);
  }
}
