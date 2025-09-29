import type { EthSigner } from '@aztec/ethereum';
import type { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { KeystoreManager, loadKeystoreFile } from '@aztec/node-keystore';
import type { EthRemoteSignerConfig } from '@aztec/node-keystore';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { InvalidValidatorPrivateKeyError } from '@aztec/stdlib/validators';

import type { TypedDataDefinition } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { ExtendedValidatorKeyStore } from './interface.js';

type AddressHex = string;
type ValidatorIndex = number;

interface ValidatorCache {
  attesters: EthSigner[];
  publishers: EthSigner[];
  all: EthSigner[];
  byAddress: Map<AddressHex, EthSigner>; // all signers, any role
  attesterSet: Set<AddressHex>; // attester addresses only
}

export class NodeKeystoreAdapter implements ExtendedValidatorKeyStore {
  private readonly keystoreManager: KeystoreManager;

  // Per-validator cache (lazy)
  private readonly validators = new Map<ValidatorIndex, ValidatorCache>();

  private readonly addressIndex = new Map<AddressHex, { signer: EthSigner; validatorIndex: ValidatorIndex }>();

  private constructor(keystoreManager: KeystoreManager) {
    this.keystoreManager = keystoreManager;
  }

  /**
   * Create an adapter from a keystore JSON file on disk.
   * @param keystoreFilePath Absolute or relative path to a keystore JSON file
   * @returns A configured NodeKeystoreAdapter instance
   * @throws Error when the file fails schema validation or cannot be read
   */
  static fromKeystoreFile(keystoreFilePath: string): NodeKeystoreAdapter {
    const keystoreConfig = loadKeystoreFile(keystoreFilePath);
    return NodeKeystoreAdapter.fromKeystoreConfig(keystoreConfig);
  }

  /**
   * Create an adapter from an in-memory keystore-like object.
   * Validates resolved duplicate attester addresses across validators and sources.
   * @param keystoreConfig Parsed config object (typically result of loadKeystoreFile)
   * @returns A configured NodeKeystoreAdapter instance
   * @throws Error when resolved duplicate attester addresses are detected
   */
  static fromKeystoreConfig(keystoreConfig: unknown): NodeKeystoreAdapter {
    const keystoreManager = new KeystoreManager(keystoreConfig as any);
    // Validate resolved attester addresses (covers JSON V3 and mnemonic duplicates across validators)
    keystoreManager.validateResolvedUniqueAttesterAddresses();
    return new NodeKeystoreAdapter(keystoreManager);
  }

  /**
   * Build an adapter directly from a list of validator private keys.
   * Each key becomes a separate validator using the same key for attester and publisher,
   * coinbase defaults to the derived EOA address, and feeRecipient is a 32-byte padded address.
   * Note: Fee recipient is a temporary placeholder, replace with actual fee recipient when implemented.
   */
  static fromPrivateKeys(privateKeys: string[]): NodeKeystoreAdapter {
    // Minimal validation: 0x + 64 hex
    const isPk = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);
    for (const pk of privateKeys) {
      if (!isPk(pk)) {
        throw new InvalidValidatorPrivateKeyError();
      }
    }

    const validators = privateKeys.map(pk => {
      const account = privateKeyToAccount(pk as `0x${string}`);
      const ethAddress = account.address as `0x${string}`;
      // TODO: Temporary fee recipient, replace with actual fee recipient when implemented
      const feeRecipient = `0x${ethAddress.slice(2).padStart(64, '0')}` as `0x${string}`;
      return {
        attester: pk as `0x${string}`,
        publisher: pk as `0x${string}`,
        coinbase: ethAddress,
        feeRecipient,
      };
    });

    const cfg = { schemaVersion: 1, validators } as const;
    return NodeKeystoreAdapter.fromKeystoreConfig(cfg);
  }

  /**
   * Build an adapter for a Web3Signer setup by providing the signer URL and the EOA addresses.
   * Each address becomes a separate validator; attester and publisher point to the same remote signer entry.
   * Note: Fee recipient is a temporary placeholder, replace with actual fee recipient when implemented.
   */
  static fromWeb3Signer(web3SignerUrl: string, addresses: EthAddress[]): NodeKeystoreAdapter {
    const validators = addresses.map(address => {
      const ethAddress = address.toString() as `0x${string}`;
      // TODO: Temporary fee recipient, replace with actual fee recipient when implemented
      const feeRecipient = `0x${ethAddress.slice(2).padStart(64, '0')}` as `0x${string}`;
      return {
        attester: { address: ethAddress, remoteSignerUrl: web3SignerUrl },
        publisher: { address: ethAddress, remoteSignerUrl: web3SignerUrl },
        coinbase: ethAddress,
        feeRecipient,
      };
    });

    const cfg = { schemaVersion: 1, validators } as const;
    return NodeKeystoreAdapter.fromKeystoreConfig(cfg);
  }

  static fromKeyStoreManager(manager: KeystoreManager): NodeKeystoreAdapter {
    return new NodeKeystoreAdapter(manager);
  }

  /**
   * Normalize address keys to lowercase hex strings for map/set usage.
   */
  private static key(addr: EthAddress | AddressHex): AddressHex {
    return typeof addr === 'string' ? addr.toLowerCase() : addr.toString().toLowerCase();
  }

  /**
   * Ensure per-validator signer cache exists; build it by creating
   * attester/publisher signers and populating indices when missing.
   * @param validatorIndex Index of the validator in the keystore
   * @returns The cached validator entry
   */
  private ensureValidator(validatorIndex: number): ValidatorCache {
    const cached = this.validators.get(validatorIndex);
    if (cached) {
      return cached;
    }

    const attesters = this.keystoreManager.createAttesterSigners(validatorIndex);
    const publishers = this.keystoreManager.createPublisherSigners(validatorIndex);

    // Build 'all' + indices
    const byAddress = new Map<AddressHex, EthSigner>();
    const attesterSet = new Set<AddressHex>();

    for (const s of attesters) {
      const k = NodeKeystoreAdapter.key(s.address);
      byAddress.set(k, s);
      attesterSet.add(k);
    }
    for (const s of publishers) {
      const k = NodeKeystoreAdapter.key(s.address);
      if (!byAddress.has(k)) {
        byAddress.set(k, s);
      }
    }

    const all = Array.from(byAddress.values());

    // Populate global index
    for (const [k, signer] of byAddress.entries()) {
      this.addressIndex.set(k, { signer, validatorIndex });
    }

    const built: ValidatorCache = { attesters, publishers, all, byAddress, attesterSet };
    this.validators.set(validatorIndex, built);
    return built;
  }

  /**
   * Iterate all validator indices in the keystore manager.
   */
  private *validatorIndices(): Iterable<number> {
    const n = this.keystoreManager.getValidatorCount();
    for (let i = 0; i < n; i++) {
      yield i;
    }
  }

  /**
   * Find the validator index that contains the given attester address.
   * @param attesterAddress Address to locate
   * @returns Validator index
   * @throws Error when no validator contains the attester
   */
  private findValidatorIndexForAttester(attesterAddress: EthAddress): number {
    const key = NodeKeystoreAdapter.key(attesterAddress);

    // Fast path: if we’ve already cached any validator that includes this as attester
    for (const i of this.validatorIndices()) {
      const v = this.ensureValidator(i);
      if (v.attesterSet.has(key)) {
        return i;
      }
    }

    throw new Error(`Attester address ${attesterAddress.toString()} not found in any validator configuration`);
  }

  /**
   * Get attester address by flat index across all validators' attester sets.
   * @param index Zero-based flat index across all attesters
   * @returns EthAddress for the indexed attester
   * @throws Error when index is out of bounds
   */
  getAddress(index: number): EthAddress {
    const all = this.getAddresses();
    if (index < 0 || index >= all.length) {
      throw new Error(`Index ${index} is out of bounds (0..${all.length - 1}).`);
    }
    return all[index];
  }

  /**
   * Get all attester addresses across validators (legacy-compatible view).
   */
  getAddresses(): EthAddress[] {
    const out: EthAddress[] = [];
    for (const i of this.validatorIndices()) {
      const v = this.ensureValidator(i);
      // attester addresses only for backward compatibility
      for (const s of v.attesters) {
        out.push(s.address);
      }
    }
    return out;
  }

  /**
   * Sign typed data with all attester signers across validators.
   * @param typedData EIP-712 typed data
   * @returns Array of signatures in validator order, flattened
   */
  async signTypedData(typedData: TypedDataDefinition): Promise<Signature[]> {
    const jobs: Promise<Signature>[] = [];
    for (const i of this.validatorIndices()) {
      const v = this.ensureValidator(i);
      for (const s of v.attesters) {
        jobs.push(this.keystoreManager.signTypedData(s, typedData));
      }
    }
    return await Promise.all(jobs);
  }

  /**
   * Sign a message with all attester signers across validators.
   * @param message 32-byte message (already hashed/padded as needed)
   * @returns Array of signatures in validator order, flattened
   */
  async signMessage(message: Buffer32): Promise<Signature[]> {
    const jobs: Promise<Signature>[] = [];
    for (const i of this.validatorIndices()) {
      const v = this.ensureValidator(i);
      for (const s of v.attesters) {
        jobs.push(this.keystoreManager.signMessage(s, message));
      }
    }
    return await Promise.all(jobs);
  }

  /**
   * Sign typed data with a signer identified by address (any role).
   * Hydrates caches on-demand when the address is first seen.
   * @param address Address to sign with
   * @param typedData EIP-712 typed data
   * @returns Signature from the signer matching the address
   * @throws Error when no signer exists for the address
   */
  async signTypedDataWithAddress(address: EthAddress, typedData: TypedDataDefinition): Promise<Signature> {
    const entry = this.addressIndex.get(NodeKeystoreAdapter.key(address));
    if (entry) {
      return await this.keystoreManager.signTypedData(entry.signer, typedData);
    }

    // If not in global index yet, lazily hydrate all validators once and retry
    for (const i of this.validatorIndices()) {
      this.ensureValidator(i);
    }
    const second = this.addressIndex.get(NodeKeystoreAdapter.key(address));
    if (second) {
      return await this.keystoreManager.signTypedData(second.signer, typedData);
    }

    throw new Error(`No signer found for address ${address.toString()}`);
  }

  /**
   * Sign a message with a signer identified by address (any role).
   * Hydrates caches on-demand when the address is first seen.
   * @param address Address to sign with
   * @param message 32-byte message
   * @returns Signature from the signer matching the address
   * @throws Error when no signer exists for the address
   */
  async signMessageWithAddress(address: EthAddress, message: Buffer32): Promise<Signature> {
    const entry = this.addressIndex.get(NodeKeystoreAdapter.key(address));
    if (entry) {
      return await this.keystoreManager.signMessage(entry.signer, message);
    }

    for (const i of this.validatorIndices()) {
      this.ensureValidator(i);
    }
    const second = this.addressIndex.get(NodeKeystoreAdapter.key(address));
    if (second) {
      return await this.keystoreManager.signMessage(second.signer, message);
    }

    throw new Error(`No signer found for address ${address.toString()}`);
  }

  /**
   * Get all attester addresses across validators (alias of getAddresses).
   */
  getAttesterAddresses(): EthAddress[] {
    return this.getAddresses();
  }

  /**
   * Get the effective coinbase address for the validator that contains the given attester.
   * @param attesterAddress Address of an attester belonging to the validator
   * @returns Coinbase EthAddress
   */
  getCoinbaseAddress(attesterAddress: EthAddress): EthAddress {
    const validatorIndex = this.findValidatorIndexForAttester(attesterAddress);
    return this.keystoreManager.getCoinbaseAddress(validatorIndex);
  }

  /**
   * Get the publisher addresses for the validator that contains the given attester.
   * @param attesterAddress Address of an attester belonging to the validator
   * @returns Array of publisher addresses
   */
  getPublisherAddresses(attesterAddress: EthAddress): EthAddress[] {
    const validatorIndex = this.findValidatorIndexForAttester(attesterAddress);
    const v = this.ensureValidator(validatorIndex);
    return v.publishers.map(s => s.address);
  }

  getAttestorForPublisher(publisherAddress: EthAddress): EthAddress {
    const attestorAddresses = this.getAttesterAddresses();
    for (const attestor of attestorAddresses) {
      const publishers = this.getPublisherAddresses(attestor);
      const found = publishers.some(publisher => publisher.equals(publisherAddress));
      if (found) {
        return attestor;
      }
    }
    // Could not find an attestor for this publisher
    throw new Error(`Failed to find attestor for publisher ${publisherAddress.toString()}`);
  }

  /**
   * Get the fee recipient for the validator that contains the given attester.
   * @param attesterAddress Address of an attester belonging to the validator
   * @returns Fee recipient as AztecAddress
   */
  getFeeRecipient(attesterAddress: EthAddress): AztecAddress {
    const validatorIndex = this.findValidatorIndexForAttester(attesterAddress);
    return this.keystoreManager.getFeeRecipient(validatorIndex);
  }

  /**
   * Get the effective remote signer configuration for the attester.
   * Precedence: account-level override > validator-level override > file-level default.
   * Returns undefined for local signers (private key / JSON-V3 / mnemonic).
   * @param attesterAddress Address of an attester belonging to the validator
   * @returns Effective remote signer configuration or undefined
   */
  getRemoteSignerConfig(attesterAddress: EthAddress): EthRemoteSignerConfig | undefined {
    const validatorIndex = this.findValidatorIndexForAttester(attesterAddress);
    return this.keystoreManager.getEffectiveRemoteSignerConfig(validatorIndex, attesterAddress);
  }
}
