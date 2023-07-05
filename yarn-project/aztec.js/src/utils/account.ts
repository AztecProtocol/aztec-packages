import { AccountCollection, AccountContract, AztecRPC, EcdsaAuthProvider } from '@aztec/aztec-rpc';
import { AztecAddress, EthAddress, Fr, Point } from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { EcdsaAccountContractAbi } from '@aztec/noir-contracts/examples';
import { AccountWallet, Wallet } from '../aztec_rpc_client/wallet.js';
import { ContractDeployer } from '../index.js';

/**
 * Creates an Aztec Account.
 * @returns The account's address & public key.
 */
export async function createAccounts(
  aztecRpcClient: AztecRPC,
  privateKey: Buffer,
  numberOfAccounts = 1,
  logger = createDebugLogger('aztec:aztec.js:accounts'),
): Promise<Wallet> {
  const accountImpls = new AccountCollection();
  const results: [AztecAddress, Point][] = [];
  for (let i = 0; i < numberOfAccounts; ++i) {
    // We use the well-known private key and the validating account contract for the first account,
    // and generate random keypairs with gullible account contracts (ie no sig validation) for the rest.
    // TODO(#662): Let the aztec rpc server generate the keypair rather than hardcoding the private key
    const privKey = i == 0 ? privateKey : randomBytes(32);
    const accountAbi = EcdsaAccountContractAbi;
    const { publicKey: pubKey, partialAddress } = await aztecRpcClient.addAccount2(
      accountAbi,
      [],
      EthAddress.ZERO,
      Fr.ZERO,
      privKey,
    );
    const contractDeployer = new ContractDeployer(accountAbi, aztecRpcClient, pubKey);
    const tx = contractDeployer.deploy().send();
    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();
    const address = receipt.contractAddress!;
    logger(`Created account ${address.toString()} with public key ${pubKey.toString()}`);
    accountImpls.registerAccount(
      address,
      new AccountContract(address, pubKey, new EcdsaAuthProvider(privKey), partialAddress, accountAbi),
    );
    results.push([address, pubKey]);
  }
  return new AccountWallet(aztecRpcClient, accountImpls);
}
