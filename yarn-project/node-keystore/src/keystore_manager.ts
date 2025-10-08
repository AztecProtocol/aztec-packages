/**
 * Keystore Manager
 *
 * Manages keystore configuration and delegates signing operations to appropriate signers.
 */
import type { EthSigner } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { Wallet } from '@ethersproject/wallet';
import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';
import type { TypedDataDefinition } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { ethPrivateKeySchema } from './schemas.js';
import { LocalSigner, RemoteSigner } from './signer.js';
import type {
  AttesterAccounts,
  EthAccount,
  EthAccounts,
  EthRemoteSignerAccount,
  EthRemoteSignerConfig,
  JsonKeyFileV3Config,
  KeyStore,
  MnemonicConfig,
  ProverKeyStore,
  ValidatorKeyStore as ValidatorKeystoreConfig,
} from './types.js';

/**
 * Error thrown when keystore operations fail
 */
export class KeystoreError extends Error {
  constructor(
    message: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'KeystoreError';
  }
}

/**
 * Keystore Manager - coordinates signing operations based on keystore configuration
 */
export class KeystoreManager {
  private readonly keystore: KeyStore;

  /**
   * Create a keystore manager from a parsed configuration.
   * Performs a lightweight duplicate-attester check without decrypting JSON V3 or deriving mnemonics.
   * @param keystore Parsed keystore configuration
   */
  constructor(keystore: KeyStore) {
    this.keystore = keystore;
    this.validateUniqueAttesterAddresses();
  }

  /**
   * Validates all remote signers in the keystore are accessible and have the required addresses.
   * Should be called after construction if validation is needed.
   */
  async validateSigners(): Promise<void> {
    // Collect all remote signers with their addresses grouped by URL
    const remoteSignersByUrl = new Map<string, Set<string>>();

    // Helper to extract remote signer URL from config
    const getUrl = (config: EthRemoteSignerConfig): string => {
      return typeof config === 'string' ? config : config.remoteSignerUrl;
    };

    // Helper to collect remote signers from accounts
    const collectRemoteSigners = (accounts: EthAccounts, defaultRemoteSigner?: EthRemoteSignerConfig): void => {
      const processAccount = (account: EthAccount): void => {
        if (typeof account === 'object' && !('path' in account) && !('mnemonic' in (account as any))) {
          // This is a remote signer account
          const remoteSigner = account as EthRemoteSignerAccount;
          const address = 'address' in remoteSigner ? remoteSigner.address : remoteSigner;

          let url: string;
          if ('remoteSignerUrl' in remoteSigner && remoteSigner.remoteSignerUrl) {
            url = remoteSigner.remoteSignerUrl;
          } else if (defaultRemoteSigner) {
            url = getUrl(defaultRemoteSigner);
          } else {
            return; // No remote signer URL available
          }

          if (!remoteSignersByUrl.has(url)) {
            remoteSignersByUrl.set(url, new Set());
          }
          remoteSignersByUrl.get(url)!.add(address.toString());
        }
      };

      if (Array.isArray(accounts)) {
        accounts.forEach(account => collectRemoteSigners(account, defaultRemoteSigner));
      } else if (typeof accounts === 'object' && 'mnemonic' in accounts) {
        // Skip mnemonic configs
      } else {
        processAccount(accounts as EthAccount);
      }
    };

    // Collect from validators
    const validatorCount = this.getValidatorCount();
    for (let i = 0; i < validatorCount; i++) {
      const validator = this.getValidator(i);
      const remoteSigner = validator.remoteSigner || this.keystore.remoteSigner;

      collectRemoteSigners(this.extractEthAccountsFromAttester(validator.attester), remoteSigner);
      if (validator.publisher) {
        collectRemoteSigners(validator.publisher, remoteSigner);
      }
    }

    // Collect from slasher
    if (this.keystore.slasher) {
      collectRemoteSigners(this.keystore.slasher, this.keystore.remoteSigner);
    }

    // Collect from prover
    if (this.keystore.prover && typeof this.keystore.prover === 'object' && 'publisher' in this.keystore.prover) {
      collectRemoteSigners(this.keystore.prover.publisher, this.keystore.remoteSigner);
    }

    // Validate each remote signer URL with all its addresses
    for (const [url, addresses] of remoteSignersByUrl.entries()) {
      if (addresses.size > 0) {
        await RemoteSigner.validateAccess(url, Array.from(addresses));
      }
    }
  }

  /**
   * Validates that attester addresses are unique across all validators
   * Only checks simple private key attesters, not JSON-V3 or mnemonic attesters,
   * these are validated when decrypting the JSON-V3 keystore files
   * @throws KeystoreError if duplicate attester addresses are found
   */
  private validateUniqueAttesterAddresses(): void {
    const seenAddresses = new Set<string>();
    const validatorCount = this.getValidatorCount();
    for (let validatorIndex = 0; validatorIndex < validatorCount; validatorIndex++) {
      const validator = this.getValidator(validatorIndex);
      const addresses = this.extractAddressesWithoutSensitiveOperations(validator.attester);
      for (const addr of addresses) {
        const address = addr.toString().toLowerCase();
        if (seenAddresses.has(address)) {
          throw new KeystoreError(
            `Duplicate attester address found: ${addr.toString()}. An attester address may only appear once across all configuration blocks.`,
          );
        }
        seenAddresses.add(address);
      }
    }
  }

  /**
   * Best-effort address extraction that avoids decryption/derivation (no JSON-V3 or mnemonic processing).
   * This is used at construction time to check for obvious duplicates without throwing for invalid inputs.
   */
  private extractAddressesWithoutSensitiveOperations(accounts: AttesterAccounts): EthAddress[] {
    const ethAccounts = this.extractEthAccountsFromAttester(accounts);
    return this.extractAddressesFromEthAccountsNonSensitive(ethAccounts);
  }

  /**
   * Extract addresses from EthAccounts without sensitive operations (no decryption/derivation).
   */
  private extractAddressesFromEthAccountsNonSensitive(accounts: EthAccounts): EthAddress[] {
    const results: EthAddress[] = [];

    const handleAccount = (account: EthAccount): void => {
      if (typeof account === 'string') {
        if (account.startsWith('0x') && account.length === 66) {
          try {
            const signer = new LocalSigner(Buffer32.fromString(ethPrivateKeySchema.parse(account)));
            results.push(signer.address);
          } catch {
            // ignore invalid private key at construction time
          }
        }
        return;
      }

      if ('path' in account) {
        return;
      }

      if ('mnemonic' in (account as any)) {
        return;
      }

      const remoteSigner: EthRemoteSignerAccount = account;
      if ('address' in remoteSigner) {
        results.push(remoteSigner.address);
        return;
      }
      results.push(remoteSigner);
    };

    if (Array.isArray(accounts)) {
      for (const account of accounts) {
        handleAccount(account as EthAccount);
      }
      return results;
    }

    if (typeof accounts === 'object' && accounts !== null && 'mnemonic' in (accounts as any)) {
      return results;
    }

    handleAccount(accounts as EthAccount);
    return results;
  }

  /**
   * Create signers for validator attester accounts
   */
  createAttesterSigners(validatorIndex: number): EthSigner[] {
    const validator = this.getValidator(validatorIndex);
    const ethAccounts = this.extractEthAccountsFromAttester(validator.attester);
    return this.createSignersFromEthAccounts(ethAccounts, validator.remoteSigner || this.keystore.remoteSigner);
  }

  /**
   * Create signers for validator publisher accounts (falls back to attester if not specified)
   */
  createPublisherSigners(validatorIndex: number): EthSigner[] {
    const validator = this.getValidator(validatorIndex);

    if (validator.publisher) {
      return this.createSignersFromEthAccounts(
        validator.publisher,
        validator.remoteSigner || this.keystore.remoteSigner,
      );
    }

    // Fall back to attester signers
    return this.createAttesterSigners(validatorIndex);
  }

  createAllValidatorPublisherSigners(): EthSigner[] {
    const numValidators = this.getValidatorCount();
    const allPublishers = [];

    for (let i = 0; i < numValidators; i++) {
      allPublishers.push(...this.createPublisherSigners(i));
    }

    return allPublishers;
  }

  /**
   * Create signers for slasher accounts
   */
  createSlasherSigners(): EthSigner[] {
    if (!this.keystore.slasher) {
      return [];
    }

    return this.createSignersFromEthAccounts(this.keystore.slasher, this.keystore.remoteSigner);
  }

  /**
   * Create signers for prover accounts
   */
  createProverSigners(): { id: EthAddress | undefined; signers: EthSigner[] } | undefined {
    if (!this.keystore.prover) {
      return undefined;
    }

    // Handle prover being a private key, JSON key store or remote signer with nested address
    if (
      typeof this.keystore.prover === 'string' ||
      'path' in this.keystore.prover ||
      'address' in this.keystore.prover
    ) {
      const signers = this.createSignersFromEthAccounts(this.keystore.prover as EthAccount, this.keystore.remoteSigner);
      return {
        id: undefined,
        signers,
      };
    }

    // Handle prover as Id and specified publishers
    if ('id' in this.keystore.prover) {
      const id = this.keystore.prover.id;
      const signers = this.createSignersFromEthAccounts(this.keystore.prover.publisher, this.keystore.remoteSigner);
      return { id, signers };
    }

    // Here, prover is just an EthAddress for a remote signer
    const signers = this.createSignersFromEthAccounts(this.keystore.prover, this.keystore.remoteSigner);
    return {
      id: undefined,
      signers,
    };
  }

  /**
   * Get validator configuration by index
   */
  getValidator(index: number): ValidatorKeystoreConfig {
    if (!this.keystore.validators || index >= this.keystore.validators.length || index < 0) {
      throw new KeystoreError(`Validator index ${index} out of bounds`);
    }
    return this.keystore.validators[index];
  }

  /**
   * Get validator count
   */
  getValidatorCount(): number {
    return this.keystore.validators?.length || 0;
  }

  /**
   * Get coinbase address for validator (falls back to first attester address)
   */
  getCoinbaseAddress(validatorIndex: number): EthAddress {
    const validator = this.getValidator(validatorIndex);

    if (validator.coinbase) {
      return validator.coinbase;
    }

    // Fall back to first attester address
    const attesterSigners = this.createAttesterSigners(validatorIndex);
    if (attesterSigners.length === 0) {
      throw new KeystoreError(`No attester signers found for validator ${validatorIndex}`);
    }

    return attesterSigners[0].address;
  }

  /**
   * Get fee recipient for validator
   */
  getFeeRecipient(validatorIndex: number): AztecAddress {
    const validator = this.getValidator(validatorIndex);
    return validator.feeRecipient;
  }

  /**
   * Get the raw slasher configuration as provided in the keystore file.
   * @returns The slasher accounts configuration or undefined if not set
   */
  getSlasherAccounts(): EthAccounts | undefined {
    return this.keystore.slasher;
  }

  /**
   * Get the raw prover configuration as provided in the keystore file.
   * @returns The prover configuration or undefined if not set
   */
  getProverConfig(): ProverKeyStore | undefined {
    return this.keystore.prover;
  }

  /**
   * Resolves attester accounts (including JSON V3 and mnemonic) and checks for duplicate addresses across validators.
   * Throws if the same resolved address appears in more than one validator configuration.
   */
  validateResolvedUniqueAttesterAddresses(): void {
    const seenAddresses = new Set<string>();
    const validatorCount = this.getValidatorCount();
    for (let validatorIndex = 0; validatorIndex < validatorCount; validatorIndex++) {
      const validator = this.getValidator(validatorIndex);
      const signers = this.createSignersFromEthAccounts(
        this.extractEthAccountsFromAttester(validator.attester),
        validator.remoteSigner || this.keystore.remoteSigner,
      );
      for (const signer of signers) {
        const address = signer.address.toString().toLowerCase();
        if (seenAddresses.has(address)) {
          throw new KeystoreError(
            `Duplicate attester address found after resolving accounts: ${address}. An attester address may only appear once across all configuration blocks.`,
          );
        }
        seenAddresses.add(address);
      }
    }
  }

  /**
   * Create signers from EthAccounts configuration
   */
  private createSignersFromEthAccounts(
    accounts: EthAccounts,
    defaultRemoteSigner?: EthRemoteSignerConfig,
  ): EthSigner[] {
    if (typeof accounts === 'string') {
      return [this.createSignerFromEthAccount(accounts, defaultRemoteSigner)];
    }

    if (Array.isArray(accounts)) {
      const signers: EthSigner[] = [];
      for (const account of accounts) {
        const accountSigners = this.createSignersFromEthAccounts(account, defaultRemoteSigner);
        signers.push(...accountSigners);
      }
      return signers;
    }

    // Mnemonic configuration
    if ('mnemonic' in accounts) {
      return this.createSignersFromMnemonic(accounts);
    }

    // Single account object - handle JSON V3 directory case
    if ('path' in accounts) {
      const result = this.createSignerFromJsonV3(accounts);
      return result;
    }

    return [this.createSignerFromEthAccount(accounts, defaultRemoteSigner)];
  }

  /**
   * Create a signer from a single EthAccount configuration
   */
  private createSignerFromEthAccount(account: EthAccount, defaultRemoteSigner?: EthRemoteSignerConfig): EthSigner {
    // Private key (hex string)
    if (typeof account === 'string') {
      if (account.startsWith('0x') && account.length === 66) {
        // Private key
        return new LocalSigner(Buffer32.fromString(ethPrivateKeySchema.parse(account)));
      } else {
        throw new Error(`Invalid private key`);
      }
    }

    // JSON V3 keystore
    if ('path' in account) {
      const result = this.createSignerFromJsonV3(account);
      return result[0];
    }

    // Remote signer account
    const remoteSigner: EthRemoteSignerAccount = account;

    if ('address' in remoteSigner) {
      // Remote signer with config
      const config = remoteSigner.remoteSignerUrl
        ? {
            remoteSignerUrl: remoteSigner.remoteSignerUrl,
            certPath: remoteSigner.certPath,
            certPass: remoteSigner.certPass,
          }
        : defaultRemoteSigner;
      if (!config) {
        throw new KeystoreError(`No remote signer configuration found for address ${remoteSigner.address}`);
      }

      return new RemoteSigner(remoteSigner.address, config);
    }

    // Just an address - use default config
    if (!defaultRemoteSigner) {
      throw new KeystoreError(`No remote signer configuration found for address ${remoteSigner}`);
    }
    return new RemoteSigner(remoteSigner, defaultRemoteSigner);
  }

  /**
   * Create signer from JSON V3 keystore file or directory
   */
  private createSignerFromJsonV3(config: JsonKeyFileV3Config): EthSigner[] {
    try {
      const stats = statSync(config.path);

      if (stats.isDirectory()) {
        // Handle directory - load all JSON files
        const files = readdirSync(config.path);
        const signers: EthSigner[] = [];
        const seenAddresses = new Map<string, string>(); // address -> file name

        for (const file of files) {
          // Only process .json files
          if (extname(file).toLowerCase() !== '.json') {
            continue;
          }

          const filePath = join(config.path, file);
          try {
            const signer = this.createSignerFromSingleJsonV3File(filePath, config.password);
            const addressString = signer.address.toString().toLowerCase();
            const existingFile = seenAddresses.get(addressString);
            if (existingFile) {
              throw new KeystoreError(
                `Duplicate JSON V3 keystore address ${addressString} found in directory ${config.path} (files: ${existingFile} and ${file}). Each keystore must have a unique address.`,
              );
            }
            seenAddresses.set(addressString, file);
            signers.push(signer);
          } catch (error) {
            // Re-throw with file context
            throw new KeystoreError(`Failed to load keystore file ${file}: ${error}`, error as Error);
          }
        }

        if (signers.length === 0) {
          throw new KeystoreError(`No JSON keystore files found in directory ${config.path}`);
        }
        return signers;
      } else {
        // Single file
        return [this.createSignerFromSingleJsonV3File(config.path, config.password)];
      }
    } catch (error) {
      if (error instanceof KeystoreError) {
        throw error;
      }
      throw new KeystoreError(`Failed to access JSON V3 keystore ${config.path}: ${error}`, error as Error);
    }
  }

  /**
   * Create signer from a single JSON V3 keystore file
   */
  private createSignerFromSingleJsonV3File(filePath: string, password?: string): EthSigner {
    try {
      // Read the keystore file
      const keystoreJson = readFileSync(filePath, 'utf8');

      // Get password - prompt for it if not provided
      const resolvedPassword = password;
      if (!resolvedPassword) {
        throw new KeystoreError(`No password provided for keystore ${filePath}. Provide password in config.`);
      }

      // Use @ethersproject/wallet to decrypt the JSON V3 keystore synchronously
      const ethersWallet = Wallet.fromEncryptedJsonSync(keystoreJson, resolvedPassword);

      // Convert the private key to our format
      const privateKey = Buffer32.fromString(ethersWallet.privateKey);

      return new LocalSigner(privateKey);
    } catch (error) {
      const err = error as Error;
      throw new KeystoreError(`Failed to decrypt JSON V3 keystore ${filePath}: ${err.message}`, err);
    }
  }

  /**
   * Create signers from mnemonic configuration using BIP44 derivation
   */
  private createSignersFromMnemonic(config: MnemonicConfig): EthSigner[] {
    const { mnemonic, addressIndex = 0, accountIndex = 0, addressCount = 1, accountCount = 1 } = config;
    const signers: EthSigner[] = [];

    try {
      // Use viem's mnemonic derivation (imported at top of file)

      // Normalize mnemonic by trimming whitespace
      const normalizedMnemonic = mnemonic.trim();

      for (let accIdx = accountIndex; accIdx < accountIndex + accountCount; accIdx++) {
        for (let addrIdx = addressIndex; addrIdx < addressIndex + addressCount; addrIdx++) {
          const viemAccount = mnemonicToAccount(normalizedMnemonic, {
            accountIndex: accIdx,
            addressIndex: addrIdx,
          });

          // Extract the private key from the viem account
          const privateKeyBytes = viemAccount.getHdKey().privateKey!;
          const privateKey = Buffer32.fromBuffer(Buffer.from(privateKeyBytes));
          signers.push(new LocalSigner(privateKey));
        }
      }

      return signers;
    } catch (error) {
      throw new KeystoreError(`Failed to derive accounts from mnemonic: ${error}`, error as Error);
    }
  }

  /**
   * Sign message with a specific signer
   */
  async signMessage(signer: EthSigner, message: Buffer32): Promise<Signature> {
    return await signer.signMessage(message);
  }

  /**
   * Sign typed data with a specific signer
   */
  async signTypedData(signer: EthSigner, typedData: TypedDataDefinition): Promise<Signature> {
    return await signer.signTypedData(typedData);
  }

  /**
   * Get the effective remote signer configuration for a specific attester address
   * Precedence: account-level override > validator-level config > file-level default
   */
  getEffectiveRemoteSignerConfig(
    validatorIndex: number,
    attesterAddress: EthAddress,
  ): EthRemoteSignerConfig | undefined {
    const validator = this.getValidator(validatorIndex);

    // Helper to get address from an account configuration
    const getAddressFromAccount = (account: EthAccount): EthAddress | EthAddress[] | undefined => {
      if (typeof account === 'string') {
        if (account.startsWith('0x') && account.length === 66) {
          // This is a private key - derive the address
          try {
            const signer = new LocalSigner(Buffer32.fromString(ethPrivateKeySchema.parse(account)));
            return signer.address;
          } catch {
            return undefined;
          }
        }
        return undefined;
      }

      // JSON V3 keystore
      if ('path' in account) {
        try {
          const signers = this.createSignerFromJsonV3(account);
          return signers.map(s => s.address);
        } catch {
          return undefined;
        }
      }

      // Remote signer account, either it is an address or the address is nested
      const remoteSigner: EthRemoteSignerAccount = account;
      if ('address' in remoteSigner) {
        return remoteSigner.address;
      }
      return remoteSigner;
    };

    // Helper to check if account matches and get its remote signer config
    const checkAccount = (account: EthAccount): EthRemoteSignerConfig | undefined => {
      const addresses = getAddressFromAccount(account);
      if (!addresses) {
        return undefined;
      }

      const addressArray = Array.isArray(addresses) ? addresses : [addresses];
      const matches = addressArray.some(addr => addr.equals(attesterAddress));

      if (!matches) {
        return undefined;
      }

      // Found a match - determine the config to return
      if (typeof account === 'string') {
        return undefined;
      }

      // JSON V3 - local signer, no remote config
      if ('path' in account) {
        return undefined;
      }

      // Remote signer account with potential override
      const remoteSigner: EthRemoteSignerAccount = account;

      if ('address' in remoteSigner) {
        // Has inline config
        if (remoteSigner.remoteSignerUrl) {
          return {
            remoteSignerUrl: remoteSigner.remoteSignerUrl,
            certPath: remoteSigner.certPath,
            certPass: remoteSigner.certPass,
          };
        } else {
          // No URL specified, use defaults
          return validator.remoteSigner || this.keystore.remoteSigner;
        }
      }
      // Just an address, use defaults
      return validator.remoteSigner || this.keystore.remoteSigner;
    };

    // Normalize attester to EthAccounts and search
    const normalized = this.extractEthAccountsFromAttester(validator.attester);

    const findInEthAccounts = (accs: EthAccounts): EthRemoteSignerConfig | undefined => {
      if (typeof accs === 'string') {
        return checkAccount(accs);
      }
      if (Array.isArray(accs)) {
        for (const a of accs as EthAccount[]) {
          const res = checkAccount(a);
          if (res !== undefined) {
            return res;
          }
        }
        return undefined;
      }
      if (typeof accs === 'object' && accs !== null && 'mnemonic' in accs) {
        // mnemonic-derived keys are local signers; no remote signer config
        return undefined;
      }
      return checkAccount(accs as EthAccount);
    };

    return findInEthAccounts(normalized);
  }

  /** Extract ETH accounts from AttesterAccounts */
  private extractEthAccountsFromAttester(attester: AttesterAccounts): EthAccounts {
    if (typeof attester === 'string') {
      return attester;
    }
    if (Array.isArray(attester)) {
      const out: EthAccount[] = [];
      for (const item of attester) {
        if (typeof item === 'string') {
          out.push(item);
        } else if ('eth' in (item as any)) {
          out.push((item as any).eth as EthAccount);
        } else if (!('mnemonic' in (item as any))) {
          out.push(item as EthAccount);
        }
      }
      return out;
    }
    if ('mnemonic' in (attester as any)) {
      return attester as any;
    }
    if ('eth' in (attester as any)) {
      return (attester as any).eth as EthAccount;
    }
    return attester as any;
  }
}
