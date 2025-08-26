/**
 * Keystore Manager
 *
 * Manages keystore configuration and delegates signing operations to appropriate signers.
 */
import type { EthSigner } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

import { Wallet } from '@ethersproject/wallet';
import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join } from 'path';
import type { TypedDataDefinition } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { LocalSigner, RemoteSigner } from './signer.js';
import type {
  EthAccount,
  EthAccounts,
  EthJsonKeyFileV3Config,
  EthMnemonicConfig,
  EthPrivateKey,
  EthRemoteSignerAccount,
  EthRemoteSignerConfig,
  KeyStore,
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
  private extractAddressesWithoutSensitiveOperations(accounts: EthAccounts): EthAddress[] {
    const results: EthAddress[] = [];

    const handleAccount = (account: EthAccount): void => {
      // String cases: private key or address or remote signer address
      if (typeof account === 'string') {
        if (account.startsWith('0x') && account.length === 66) {
          // Private key -> derive address locally without external deps
          try {
            const signer = new LocalSigner(Buffer32.fromString(account as EthPrivateKey));
            results.push(signer.address);
          } catch {
            // Ignore invalid private key at construction time
          }
          return;
        }

        if (account.startsWith('0x') && account.length === 42) {
          // Address string
          try {
            results.push(EthAddress.fromString(account));
          } catch {
            // Ignore invalid address format at construction time
          }
          return;
        }

        // Any other string cannot be confidently resolved here
        return;
      }

      // JSON V3 keystore: skip (requires decryption)
      if ('path' in account) {
        return;
      }

      // Mnemonic: skip (requires derivation and may throw on invalid mnemonics)
      if ('mnemonic' in (account as any)) {
        return;
      }

      // Remote signer account (object form)
      const remoteSigner = account as EthRemoteSignerAccount;
      const address = typeof remoteSigner === 'string' ? remoteSigner : remoteSigner.address;
      if (address) {
        try {
          results.push(EthAddress.fromString(address));
        } catch {
          // Ignore invalid address format at construction time
        }
      }
    };

    if (Array.isArray(accounts)) {
      for (const account of accounts) {
        const subResults = this.extractAddressesWithoutSensitiveOperations(account);
        results.push(...subResults);
      }
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
    return this.createSignersFromEthAccounts(validator.attester, validator.remoteSigner || this.keystore.remoteSigner);
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

    // Handle simple prover case (just a private key)
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

    // Handle complex prover case with id and publishers
    const proverConfig = this.keystore.prover;
    const signers: EthSigner[] = [];

    for (const publisherAccounts of proverConfig.publisher) {
      const publisherSigners = this.createSignersFromEthAccounts(publisherAccounts, this.keystore.remoteSigner);
      signers.push(...publisherSigners);
    }

    return {
      id: EthAddress.fromString(proverConfig.id),
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
      return EthAddress.fromString(validator.coinbase);
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
  getFeeRecipient(validatorIndex: number): string {
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
        validator.attester,
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
        return new LocalSigner(Buffer32.fromString(account as EthPrivateKey));
      } else {
        // Remote signer address only - use default remote signer config
        if (!defaultRemoteSigner) {
          throw new KeystoreError(`No remote signer configuration found for address ${account}`);
        }
        return new RemoteSigner(EthAddress.fromString(account), defaultRemoteSigner);
      }
    }

    // JSON V3 keystore
    if ('path' in account) {
      const result = this.createSignerFromJsonV3(account);
      return result[0];
    }

    // Remote signer account
    const remoteSigner = account as EthRemoteSignerAccount;
    if (typeof remoteSigner === 'string') {
      // Just an address - use default config
      if (!defaultRemoteSigner) {
        throw new KeystoreError(`No remote signer configuration found for address ${remoteSigner}`);
      }
      return new RemoteSigner(EthAddress.fromString(remoteSigner), defaultRemoteSigner);
    }

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

    return new RemoteSigner(EthAddress.fromString(remoteSigner.address), config);
  }

  /**
   * Create signer from JSON V3 keystore file or directory
   */
  private createSignerFromJsonV3(config: EthJsonKeyFileV3Config): EthSigner[] {
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
  private createSignersFromMnemonic(config: EthMnemonicConfig): EthSigner[] {
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
    const getAddressFromAccount = (account: EthAccount): EthAddress | EthAddress[] | null => {
      if (typeof account === 'string') {
        if (account.startsWith('0x') && account.length === 66) {
          // This is a private key - derive the address
          try {
            const signer = new LocalSigner(Buffer32.fromString(account as EthPrivateKey));
            return signer.address;
          } catch {
            return null;
          }
        } else if (account.startsWith('0x') && account.length === 42) {
          // This is an address
          try {
            return EthAddress.fromString(account);
          } catch {
            return null;
          }
        }
        return null;
      }

      // JSON V3 keystore
      if ('path' in account) {
        try {
          const signers = this.createSignerFromJsonV3(account);
          return signers.map(s => s.address);
        } catch {
          return null;
        }
      }

      // Remote signer account
      const remoteSigner = account as EthRemoteSignerAccount;
      const address = typeof remoteSigner === 'string' ? remoteSigner : remoteSigner.address;
      try {
        return EthAddress.fromString(address);
      } catch {
        return null;
      }
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
        if (account.startsWith('0x') && account.length === 66) {
          // Private key - local signer, no remote config
          return undefined;
        } else {
          // Address only - use defaults
          return validator.remoteSigner || this.keystore.remoteSigner;
        }
      }

      // JSON V3 - local signer, no remote config
      if ('path' in account) {
        return undefined;
      }

      // Remote signer account with potential override
      const remoteSigner = account as EthRemoteSignerAccount;
      if (typeof remoteSigner === 'string') {
        // Just an address - use defaults
        return validator.remoteSigner || this.keystore.remoteSigner;
      }

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
    };

    // Check the attester configuration
    const { attester } = validator;

    if (typeof attester === 'string') {
      const result = checkAccount(attester);
      return result === undefined ? undefined : result;
    }

    if (Array.isArray(attester)) {
      for (const account of attester) {
        const result = checkAccount(account);
        if (result !== undefined) {
          return result;
        }
      }
      return undefined;
    }

    // Mnemonic configuration
    if ('mnemonic' in attester) {
      try {
        const signers = this.createSignersFromMnemonic(attester);
        const matches = signers.some(s => s.address.equals(attesterAddress));
        // Mnemonic-derived keys are local signers
        return matches ? undefined : undefined;
      } catch {
        return undefined;
      }
    }

    // Single account object
    const result = checkAccount(attester);
    return result === undefined ? undefined : result;
  }
}
