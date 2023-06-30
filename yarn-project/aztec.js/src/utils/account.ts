import { AztecRPC } from '@aztec/aztec-rpc';
import { AztecAddress, Point } from '@aztec/circuits.js';
import { ContractDeployer } from '../index.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';
import { randomBytes } from '@aztec/foundation/crypto';

/**
 * Creates an Aztec Account.
 * @returns The account's address & public key.
 */
export async function createAccounts(
  aztecRpcClient: AztecRPC,
  privateKey: Buffer,
  numberOfAccounts = 1,
  logger = createDebugLogger('aztec:aztec.js:accounts'),
): Promise<[AztecAddress, Point][]> {
  const results: [AztecAddress, Point][] = [];
  for (let i = 0; i < numberOfAccounts; ++i) {
    // We use the well-known private key and the validating account contract for the first account,
    // and generate random keypairs with gullible account contracts (ie no sig validation) for the rest.
    // TODO(#662): Let the aztec rpc server generate the keypair rather than hardcoding the private key
    const privKey = i == 0 ? privateKey : randomBytes(32);

    const impl = SchnorrAccountContractAbi;
    const contractDeployer = new ContractDeployer(impl, aztecRpcClient);
    const deployMethod = contractDeployer.deploy();
    const tx = deployMethod.send();
    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    const address = receipt.contractAddress!;
    await aztecRpcClient.addAccount(privKey, address, deployMethod.partialContractAddress!, SchnorrAccountContractAbi);
    const pubKey = await aztecRpcClient.getAccountPublicKey(address);
    logger(`Created account ${address.toString()} with public key ${pubKey.toString()}`);
    results.push([address, pubKey]);
  }
  return results;
}
