import { AztecRPC, PrivateKey } from '@aztec/types';

import { Fr } from '../index.js';
import { Account } from './account.js';
import { CompleteAddress } from './complete_address.js';
import { EcdsaAccountContract } from './contract/ecdsa_account_contract.js';
import { SchnorrAccountContract } from './contract/schnorr_account_contract.js';
import { SingleKeyAccountContract } from './contract/single_key_account_contract.js';

export { Account } from './account.js';
export { AccountContract } from './contract/index.js';
export { Entrypoint, EntrypointCollection } from './entrypoint/index.js';

export type Salt = Fr | number | bigint;

export function getEcdsaAccount(
  rpc: AztecRPC,
  encryptionPrivateKey: PrivateKey,
  signingPrivateKey: PrivateKey,
  saltOrAddress?: Salt | CompleteAddress,
): Account {
  return new Account(rpc, encryptionPrivateKey, new EcdsaAccountContract(signingPrivateKey), saltOrAddress);
}

export function getSchnorrAccount(
  rpc: AztecRPC,
  encryptionPrivateKey: PrivateKey,
  signingPrivateKey: PrivateKey,
  saltOrAddress?: Salt | CompleteAddress,
): Account {
  return new Account(rpc, encryptionPrivateKey, new SchnorrAccountContract(signingPrivateKey), saltOrAddress);
}

export function getUnsafeSchnorrAccount(
  rpc: AztecRPC,
  encryptionAndSigningPrivateKey: PrivateKey,
  saltOrAddress?: Salt | CompleteAddress,
): Account {
  return new Account(
    rpc,
    encryptionAndSigningPrivateKey,
    new SingleKeyAccountContract(encryptionAndSigningPrivateKey),
    saltOrAddress,
  );
}
