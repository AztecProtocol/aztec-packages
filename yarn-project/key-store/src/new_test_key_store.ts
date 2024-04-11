import { type NewKeyStore, type KeyPair, type KeyStore, type PublicKey } from '@aztec/circuit-types';
import {
  type AztecAddress,
  type GrumpkinPrivateKey,
  GrumpkinScalar,
  Point,
  computeNullifierSecretKey,
  computeSiloedNullifierSecretKey,
  derivePublicKey,
  type Fr,
  GeneratorIndex,
  Fq,
} from '@aztec/circuits.js';
import { type Grumpkin } from '@aztec/circuits.js/barretenberg';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { ConstantKeyPair } from './key_pair.js';
import { poseidonHash } from '@aztec/foundation/crypto';
/**
 * TestKeyStore is an implementation of the KeyStore interface, used for managing key pairs in a testing environment.
 * It should be utilized in testing scenarios where secure key management is not required, and ease-of-use is prioritized.
 * TODO: Potentially rename to not include 'Test' in the name.
 */
export class NewTestKeyStore implements NewKeyStore {
  #keys: AztecMap<string, Buffer>;

  constructor(private curve: Grumpkin, database: AztecKVStore) {
    this.#keys = database.openMap('key_store');
  }

  public async addAccount(sk: Fr): Promise<PublicKey> {
    const masterNullifierSecretKey = poseidonHash([sk], GeneratorIndex.NSK_M);
    // TODO: Is converting from Fr to Fq an issue? Fr.MODULUS is < Fq.MODULUS so it wont' throw but should we refactor this?
    const masterNullifierPublicKey = this.curve.mul(this.curve.generator(), Fq.fromBuffer(masterNullifierSecretKey.toBuffer()))
  }

  public async getMasterNullifierPublicKey(): Promise<PublicKey> {
    return poseidonHash()
  }
}
