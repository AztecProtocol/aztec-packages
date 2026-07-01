import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { toArray } from '@aztec/foundation/iterable';
import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress, type PartialAddress } from '@aztec/stdlib/contract';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import {
  KEY_PREFIXES,
  type KeyPrefix,
  type PublicKey,
  PublicKeys,
  computeAppSecretKey,
  derivePublicKeyFromSecretKey,
  hashPublicKey,
} from '@aztec/stdlib/keys';

import type { AccountPrivacyKeys, AccountPrivacySecretKeys } from './account_privacy_keys.js';

/** Maps a key prefix to the storage suffix for the corresponding master secret key. */
function secretKeyStorageSuffix(prefix: KeyPrefix): string {
  return prefix === 'n' ? 'nhk_m' : `${prefix}sk_m`;
}

/**
 * Computes the public counterparts of an account's four privacy secret keys and assembles its {@link PublicKeys} struct
 * (used to derive the address), from the {@link AccountPrivacyKeys} passed to {@link KeyStore.addAccount}.
 *
 * The message-signing and fallback keys are already supplied as public keys, since the key store never holds their
 * secrets.
 */
async function completeAccountKeys(keys: AccountPrivacyKeys) {
  const {
    masterNullifierHidingSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    masterMessageSigningPublicKey,
    masterFallbackPublicKey,
  } = keys;

  const masterNullifierHidingPublicKey = await derivePublicKeyFromSecretKey(masterNullifierHidingSecretKey);
  const masterIncomingViewingPublicKey = await derivePublicKeyFromSecretKey(masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = await derivePublicKeyFromSecretKey(masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = await derivePublicKeyFromSecretKey(masterTaggingSecretKey);

  for (const [name, publicKey] of Object.entries({
    masterNullifierHidingPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
    masterMessageSigningPublicKey,
    masterFallbackPublicKey,
  })) {
    if (publicKey.isInfinite) {
      throw new Error(`Cannot register an account with an infinity ${name}.`);
    }
  }

  const publicKeys = new PublicKeys(
    await hashPublicKey(masterNullifierHidingPublicKey),
    masterIncomingViewingPublicKey,
    await hashPublicKey(masterOutgoingViewingPublicKey),
    await hashPublicKey(masterTaggingPublicKey),
    await hashPublicKey(masterMessageSigningPublicKey),
    await hashPublicKey(masterFallbackPublicKey),
  );

  return {
    masterNullifierHidingSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    masterNullifierHidingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
    publicKeys,
  };
}

/**
 * Used for managing keys. Can hold keys of multiple accounts.
 */
export class KeyStore {
  public static readonly SCHEMA_VERSION = 1;
  #db: AztecAsyncKVStore;
  #keys: AztecAsyncMap<string, Buffer>;

  constructor(database: AztecAsyncKVStore) {
    this.#db = database;
    this.#keys = database.openMap('key_store');
  }

  /**
   * Adds an account to the key store.
   *
   * The key store holds the four privacy secret keys (nullifier-hiding, incoming-viewing, outgoing-viewing, tagging),
   * but only the *public* message-signing and fallback keys: their secret keys are withheld, since the key store (and
   * PXE, which embeds it) is not trusted to hold them. The public keys are still needed to reconstruct the account's
   * address, which commits to all six master public keys.
   *
   * @param keys - The account's privacy keys: four secret keys plus the message-signing and fallback public keys.
   * @param partialAddress - The partial address of the account.
   * @returns The account's complete address.
   * @throws If any of the account's six master public keys would be the point at infinity.
   */
  public async addAccount(keys: AccountPrivacyKeys, partialAddress: PartialAddress): Promise<CompleteAddress> {
    const accountKeys = await completeAccountKeys(keys);
    return this.#storeAccountKeys(accountKeys, partialAddress);
  }

  /**
   * Retrieves addresses of accounts stored in the key store.
   * @returns A Promise that resolves to an array of account addresses.
   */
  public async getAccounts(): Promise<AztecAddress[]> {
    const allMapKeys = await this.#db.transactionAsync(() => toArray(this.#keys.keysAsync()));
    // We return account addresses based on the map keys that end with '-ivsk_m'
    const accounts = allMapKeys.filter(key => key.endsWith('-ivsk_m')).map(key => key.split('-')[0]);
    return accounts.map(account => AztecAddress.fromStringUnsafe(account));
  }

  /** Checks whether an account is registered in the key store. */
  public async hasAccount(account: AztecAddress): Promise<boolean> {
    return !!(await this.#db.transactionAsync(() => this.#keys.getAsync(`${account.toString()}-ivsk_m`)));
  }

  /**
   * Gets the key validation request for a given master public key hash and contract address.
   * @throws If the account corresponding to the master public key hash does not exist in the key store.
   * @param pkMHash - The master public key hash.
   * @param contractAddress - The contract address to silo the secret key in the key validation request with.
   * @returns The key validation request.
   */
  public getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    return this.#db.transactionAsync(async () => {
      const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkMHash);

      // Load the stored master public key point. The returned KVR carries only the hash, but we
      // use the point here as a witness for two integrity checks below: (1) it matches the supplied
      // hash, and (2) it matches the value derived from the stored secret key.
      const pkMBuffer = await this.#keys.getAsync(`${account.toString()}-${keyPrefix}pk_m`);
      if (!pkMBuffer) {
        throw new Error(
          `Could not find ${keyPrefix}pk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      const pkM = Point.fromBuffer(pkMBuffer);

      // Now we find the secret key for the public key
      const skStorageSuffix = secretKeyStorageSuffix(keyPrefix);
      const skMBuffer = await this.#keys.getAsync(`${account.toString()}-${skStorageSuffix}`);
      if (!skMBuffer) {
        throw new Error(
          `Could not find ${skStorageSuffix} for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      const skM = GrumpkinScalar.fromBuffer(skMBuffer);

      // The remaining awaits are non-DB computations. They are safe because no further IDB operations follow them.
      const computedPkMHash = await hashPublicKey(pkM);
      if (!computedPkMHash.equals(pkMHash)) {
        throw new Error(`Could not find ${keyPrefix}pkM for ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`);
      }

      const derivedPkM = await derivePublicKeyFromSecretKey(skM);
      if (!derivedPkM.equals(pkM)) {
        throw new Error(`Could not derive ${keyPrefix}pkM from ${keyPrefix}skM.`);
      }

      const skApp = await computeAppSecretKey(skM, contractAddress, keyPrefix!);

      return new KeyValidationRequest(pkMHash, skApp);
    });
  }

  /**
   * Gets the master nullifier public key for a given account.
   * @throws If the account does not exist in the key store.
   */
  public async getMasterNullifierHidingPublicKey(account: AztecAddress): Promise<PublicKey> {
    return Point.fromBuffer(await this.#getMasterKeyBuffer(account, 'npk_m'));
  }

  /**
   * Gets the master incoming viewing public key for a given account.
   * @throws If the account does not exist in the key store.
   */
  public async getMasterIncomingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    return Point.fromBuffer(await this.#getMasterKeyBuffer(account, 'ivpk_m'));
  }

  /**
   * Retrieves the master outgoing viewing public key.
   * @throws If the account does not exist in the key store.
   */
  public async getMasterOutgoingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    return Point.fromBuffer(await this.#getMasterKeyBuffer(account, 'ovpk_m'));
  }

  /**
   * Retrieves the master tagging public key.
   * @throws If the account does not exist in the key store.
   */
  public async getMasterTaggingPublicKey(account: AztecAddress): Promise<PublicKey> {
    return Point.fromBuffer(await this.#getMasterKeyBuffer(account, 'tpk_m'));
  }

  /**
   * Retrieves master incoming viewing secret key.
   * @throws If the account does not exist in the key store.
   */
  public async getMasterIncomingViewingSecretKey(account: AztecAddress): Promise<GrumpkinScalar> {
    return GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'ivsk_m'));
  }

  /**
   * Retrieves the four privacy secret keys the key store holds for an account. Paired with {@link addAccount}, this
   * allows exporting an account's privacy secret keys, e.g. to re-register it on another PXE. The message-signing and
   * fallback secret keys are not held by the key store and so are not returned.
   *
   * @throws If the account does not exist in the key store.
   */
  public async getAccountSecretKeys(account: AztecAddress): Promise<AccountPrivacySecretKeys> {
    return {
      masterNullifierHidingSecretKey: GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'nhk_m')),
      masterIncomingViewingSecretKey: GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'ivsk_m')),
      masterOutgoingViewingSecretKey: GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'ovsk_m')),
      masterTaggingSecretKey: GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'tsk_m')),
    };
  }

  /**
   * Retrieves application outgoing viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application outgoing viewing secret key for.
   * @param app - The application address to retrieve the outgoing viewing secret key for.
   * @returns A Promise that resolves to the application outgoing viewing secret key.
   */
  public async getAppOutgoingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterOutgoingViewingSecretKey = GrumpkinScalar.fromBuffer(await this.#getMasterKeyBuffer(account, 'ovsk_m'));

    return poseidon2HashWithSeparator(
      [masterOutgoingViewingSecretKey.hi, masterOutgoingViewingSecretKey.lo, app],
      DomainSeparator.OVSK_M,
    );
  }

  /**
   * Retrieves the sk_m corresponding to the given pk_m hash.
   * @throws If the provided hash is not associated with any of the registered accounts.
   * @param pkMHash - The master public key hash to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public getMasterSecretKey(pkMHash: Fr): Promise<GrumpkinScalar> {
    return this.#db.transactionAsync(async () => {
      const [keyPrefix, account] = await this.getKeyPrefixAndAccount(pkMHash);

      const skStorageSuffix = secretKeyStorageSuffix(keyPrefix);
      const secretKeyBuffer = await this.#keys.getAsync(`${account.toString()}-${skStorageSuffix}`);
      if (!secretKeyBuffer) {
        throw new Error(
          `Could not find ${skStorageSuffix} for ${keyPrefix}pk_m_hash ${pkMHash.toString()}. This should not happen.`,
        );
      }

      const skM = GrumpkinScalar.fromBuffer(secretKeyBuffer);

      // Non-DB computation — safe because no further IDB operations follow.
      // Integrity check: confirm the stored secret key still derives the requested hash. The check
      // is hash-based rather than point-equal because the on-disk identifier is `pk_m_hash`;
      // cryptographic collision resistance of `hashPublicKey` makes this equivalent to a
      // direct point comparison in practice.
      const derivedPkM = await derivePublicKeyFromSecretKey(skM);
      const derivedPkMHash = await hashPublicKey(derivedPkM);
      if (!derivedPkMHash.equals(pkMHash)) {
        throw new Error(
          `Could not find ${skStorageSuffix} for ${keyPrefix}pk_m_hash ${pkMHash.toString()} in secret keys buffer.`,
        );
      }

      return skM;
    });
  }

  /**
   * Checks whether a given account has a key matching the provided master public key hash.
   * @param account - The account address to check.
   * @param pkMHash - The master public key hash to look for.
   * @returns True if the account has a key with the given hash.
   */
  public accountHasKey(account: AztecAddress, pkMHash: Fr): Promise<boolean> {
    return this.#db.transactionAsync(async () => {
      const pkMHashBuffer = serializeToBuffer(pkMHash);
      for (const prefix of KEY_PREFIXES) {
        const stored = await this.#keys.getAsync(`${account.toString()}-${prefix}pk_m_hash`);
        if (stored && Buffer.from(stored).equals(pkMHashBuffer)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Gets the key prefix and account address for a given value.
   * @returns A tuple containing the key prefix and account address.
   * @dev Note that this is quite inefficient but it should not matter because there should never be too many keys
   * in the key store.
   */
  public async getKeyPrefixAndAccount(value: Bufferable): Promise<[KeyPrefix, AztecAddress]> {
    const valueBuffer = serializeToBuffer(value);
    for await (const [key, val] of this.#keys.entriesAsync()) {
      // Browser returns Uint8Array, Node.js returns Buffer
      if (Buffer.from(val).equals(valueBuffer)) {
        for (const prefix of KEY_PREFIXES) {
          if (key.includes(`-${prefix}`)) {
            const account = AztecAddress.fromStringUnsafe(key.split('-')[0]);
            return [prefix, account];
          }
        }
      }
    }
    throw new Error(`Could not find key prefix.`);
  }

  /**
   * Persists a completed set of account keys and returns the resulting complete address.
   */
  async #storeAccountKeys(
    accountKeys: Awaited<ReturnType<typeof completeAccountKeys>>,
    partialAddress: PartialAddress,
  ): Promise<CompleteAddress> {
    const {
      masterNullifierHidingSecretKey,
      masterIncomingViewingSecretKey,
      masterOutgoingViewingSecretKey,
      masterTaggingSecretKey,
      masterNullifierHidingPublicKey,
      masterOutgoingViewingPublicKey,
      masterTaggingPublicKey,
      publicKeys,
    } = accountKeys;

    const completeAddress = await CompleteAddress.fromPublicKeysAndPartialAddress(publicKeys, partialAddress);
    const { address: account } = completeAddress;

    // completeAccountKeys has already guaranteed these master public keys are non-infinity, which the kernel cannot
    // check but the address relies on.

    // The npk/ovpk/tpk hashes are already in publicKeys; ivpk_m_hash is computed for indexing.
    const masterIncomingViewingPublicKeyHash = await hashPublicKey(publicKeys.ivpkM);

    await this.#db.transactionAsync(async () => {
      // Naming of keys is as follows ${account}-${n/iv/ov/t}${sk/pk}_m.
      //
      // The message-signing and fallback keys are not stored: their secret keys are withheld from the key store, and
      // their public keys are only needed transiently to compute the address (they live in the AddressStore).
      await this.#keys.set(`${account.toString()}-ivsk_m`, masterIncomingViewingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-ovsk_m`, masterOutgoingViewingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-tsk_m`, masterTaggingSecretKey.toBuffer());
      await this.#keys.set(`${account.toString()}-nhk_m`, masterNullifierHidingSecretKey.toBuffer());

      await this.#keys.set(`${account.toString()}-npk_m`, masterNullifierHidingPublicKey.toBuffer());
      await this.#keys.set(`${account.toString()}-ivpk_m`, publicKeys.ivpkM.toBuffer());
      await this.#keys.set(`${account.toString()}-ovpk_m`, masterOutgoingViewingPublicKey.toBuffer());
      await this.#keys.set(`${account.toString()}-tpk_m`, masterTaggingPublicKey.toBuffer());

      // We store pk_m_hash under `account-{n/iv/ov/t}pk_m_hash` key to be able to obtain address and key prefix
      // using the #getKeyPrefixAndAccount function later on
      await this.#keys.set(`${account.toString()}-npk_m_hash`, publicKeys.npkMHash.toBuffer());
      await this.#keys.set(`${account.toString()}-ivpk_m_hash`, masterIncomingViewingPublicKeyHash.toBuffer());
      await this.#keys.set(`${account.toString()}-ovpk_m_hash`, publicKeys.ovpkMHash.toBuffer());
      await this.#keys.set(`${account.toString()}-tpk_m_hash`, publicKeys.tpkMHash.toBuffer());
    });

    return completeAddress;
  }

  /**
   * Fetches a stored master key buffer for an account by its storage suffix (e.g. `npk_m`, `ivsk_m`).
   * @throws If the account does not exist in the key store.
   */
  async #getMasterKeyBuffer(account: AztecAddress, suffix: string): Promise<Buffer> {
    const buffer = await this.#db.transactionAsync(() => this.#keys.getAsync(`${account.toString()}-${suffix}`));
    if (!buffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return buffer;
  }
}
