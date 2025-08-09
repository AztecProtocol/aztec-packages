/**
 * Account Resolution for Keystore Configurations
 *
 * Handles resolving different account types (private keys, remote signers, JSON keystores, mnemonics)
 * into standardized ResolvedAccount objects that can be used by validators and provers.
 *
 * (Note: Currently just skeleton draft, not implemented)
 */
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type {
  EthAccount,
  EthAccounts,
  EthAddressHex,
  EthJsonKeyFileV3Config,
  EthMnemonicConfig,
  EthPrivateKey,
  EthRemoteSignerAccount,
  EthRemoteSignerConfig,
  KeyStore,
  ProverKeyStore,
  ResolvedAccount,
  ResolvedKeyStore,
  ResolvedProverConfig,
  ResolvedValidatorConfig,
  ValidatorKeyStore,
} from './types.js';

/**
 * Error thrown when account resolution fails
 */
export class AccountResolutionError extends Error {
  constructor(
    message: string,
    public accountPath: string,
    public override cause?: Error,
  ) {
    super(`Failed to resolve account at ${accountPath}: ${message}`);
    this.name = 'AccountResolutionError';
  }
}

/**
 * Configuration options for account resolution
 */
export interface ResolverOptions {
  /** Default remote signer configuration to use when not specified in account */
  defaultRemoteSigner?: EthRemoteSignerConfig;
  /** Whether to validate resolved addresses against known formats */
  validateAddresses?: boolean;
  /** Custom derivation path prefix for mnemonic-based accounts */
  mnemonicDerivationPrefix?: string;
}

/**
 * Account resolver that converts keystore configurations to resolved accounts
 */
export class AccountResolver {
  private readonly options: ResolverOptions & {
    validateAddresses: boolean;
    mnemonicDerivationPrefix: string;
  };

  constructor(options: ResolverOptions = {}) {
    this.options = {
      validateAddresses: true,
      mnemonicDerivationPrefix: "m/44'/60'/0'/0",
      ...options,
    };
  }

  /**
   * Resolves a complete keystore configuration into resolved accounts and configurations
   */
  async resolveKeyStore(keystore: KeyStore): Promise<ResolvedKeyStore> {
    const resolved: ResolvedKeyStore = {
      validators: [],
      slashers: [],
      prover: undefined,
    };

    // Set default remote signer from keystore if not already set
    const resolverWithDefaults = this.withDefaults({
      defaultRemoteSigner: keystore.remoteSigner || this.options.defaultRemoteSigner,
    });

    // Resolve validators
    if (keystore.validators) {
      for (let i = 0; i < keystore.validators.length; i++) {
        const validator = keystore.validators[i];
        try {
          const resolvedValidator = await resolverWithDefaults.resolveValidator(validator, i);
          resolved.validators.push(resolvedValidator);
        } catch (error) {
          throw new AccountResolutionError(`Failed to resolve validator[${i}]`, `validators[${i}]`, error as Error);
        }
      }
    }

    // Resolve slasher accounts
    if (keystore.slasher) {
      try {
        resolved.slashers = await resolverWithDefaults.resolveEthAccounts(keystore.slasher, 'slasher');
      } catch (error) {
        throw new AccountResolutionError('Failed to resolve slasher accounts', 'slasher', error as Error);
      }
    }

    // Resolve prover
    if (keystore.prover) {
      try {
        resolved.prover = await resolverWithDefaults.resolveProver(keystore.prover);
      } catch (error) {
        throw new AccountResolutionError('Failed to resolve prover', 'prover', error as Error);
      }
    }

    return resolved;
  }

  /**
   * Resolves a validator configuration
   */
  async resolveValidator(validator: ValidatorKeyStore, index: number): Promise<ResolvedValidatorConfig> {
    const basePath = `validators[${index}]`;

    // Resolve attesters (required)
    const attesters = await this.resolveEthAccounts(validator.attester, `${basePath}.attester`);
    if (attesters.length === 0) {
      throw new AccountResolutionError('Validator must have at least one attester', `${basePath}.attester`);
    }

    // Resolve publishers (optional, defaults to attesters)
    const publishers = validator.publisher
      ? await this.resolveEthAccounts(validator.publisher, `${basePath}.publisher`)
      : attesters;

    // Resolve coinbase (optional, defaults to first attester)
    const coinbase = validator.coinbase ? EthAddress.fromString(validator.coinbase) : attesters[0].address;

    // Resolve fee recipient (required)
    const feeRecipient = AztecAddress.fromString(validator.feeRecipient);

    return {
      attesters,
      publishers,
      coinbase,
      feeRecipient,
    };
  }

  /**
   * Resolves a prover configuration
   */
  async resolveProver(prover: ProverKeyStore): Promise<ResolvedProverConfig> {
    // Handle simple EthAccount prover
    if (typeof prover === 'string' || 'path' in prover || 'address' in prover) {
      const account = await this.resolveEthAccount(prover as EthAccount, 'prover');
      return {
        id: account.address,
        publishers: [account],
      };
    }

    // Handle full prover configuration
    const config = prover as { id: EthAddressHex; publisher: EthAccounts[] };
    const id = EthAddress.fromString(config.id);

    // Resolve all publisher arrays
    const allPublishers: ResolvedAccount[] = [];
    for (let i = 0; i < config.publisher.length; i++) {
      const publishers = await this.resolveEthAccounts(config.publisher[i], `prover.publisher[${i}]`);
      allPublishers.push(...publishers);
    }

    if (allPublishers.length === 0) {
      throw new AccountResolutionError('Prover must have at least one publisher', 'prover.publisher');
    }

    return {
      id,
      publishers: allPublishers,
    };
  }

  /**
   * Resolves EthAccounts (single account, array of accounts, or mnemonic config)
   */
  async resolveEthAccounts(accounts: EthAccounts, path: string): Promise<ResolvedAccount[]> {
    // Handle mnemonic configuration
    if (this.isMnemonicConfig(accounts)) {
      return this.resolveMnemonicAccounts(accounts, path);
    }

    // Handle array of accounts
    if (Array.isArray(accounts)) {
      const resolved: ResolvedAccount[] = [];
      for (let i = 0; i < accounts.length; i++) {
        const account = await this.resolveEthAccount(accounts[i], `${path}[${i}]`);
        resolved.push(account);
      }
      return resolved;
    }

    // Handle single account
    const account = await this.resolveEthAccount(accounts, path);
    return [account];
  }

  /**
   * Resolves a single EthAccount
   */
  async resolveEthAccount(account: EthAccount, path: string): Promise<ResolvedAccount> {
    // Handle private key
    if (this.isPrivateKey(account)) {
      return this.resolvePrivateKeyAccount(account, path);
    }

    // Handle JSON V3 keystore file
    if (this.isJsonKeyFile(account)) {
      return this.resolveJsonKeyFileAccount(account, path);
    }

    // Handle remote signer account
    if (this.isRemoteSignerAccount(account)) {
      return this.resolveRemoteSignerAccount(account, path);
    }

    throw new AccountResolutionError(`Unsupported account type: ${typeof account}`, path);
  }

  /**
   * Resolves accounts from mnemonic configuration
   */
  private async resolveMnemonicAccounts(config: EthMnemonicConfig, path: string): Promise<ResolvedAccount[]> {
    // TODO: Implement mnemonic account derivation
    // This would use a library like ethers or similar to derive accounts from mnemonic
    throw new AccountResolutionError('Mnemonic account resolution not yet implemented', path);
  }

  /**
   * Resolves a private key account
   */
  private async resolvePrivateKeyAccount(privateKey: EthPrivateKey, path: string): Promise<ResolvedAccount> {
    // TODO: Derive address from private key using crypto library
    // For now, throw an error indicating implementation needed
    throw new AccountResolutionError('Private key account resolution not yet implemented', path);
  }

  /**
   * Resolves a JSON V3 keystore file account
   */
  private async resolveJsonKeyFileAccount(config: EthJsonKeyFileV3Config, path: string): Promise<ResolvedAccount> {
    // TODO: Load and decrypt JSON keystore file
    // This would read the file, decrypt with password, and extract private key/address
    throw new AccountResolutionError('JSON keystore file resolution not yet implemented', path);
  }

  /**
   * Resolves a remote signer account
   */
  private async resolveRemoteSignerAccount(account: EthRemoteSignerAccount, path: string): Promise<ResolvedAccount> {
    if (typeof account === 'string') {
      // Simple address case
      return {
        address: EthAddress.fromString(account),
        type: 'remote-signer',
        remoteSignerConfig: this.buildRemoteSignerConfig(undefined, path),
      };
    }

    // Full remote signer configuration
    return {
      address: EthAddress.fromString(account.address),
      type: 'remote-signer',
      remoteSignerConfig: this.buildRemoteSignerConfig(account, path),
    };
  }

  /**
   * Builds remote signer configuration, merging with defaults
   */
  private buildRemoteSignerConfig(
    account: EthRemoteSignerAccount | undefined,
    path: string,
  ): { url: string; certPath?: string; certPass?: string } {
    // Extract account config if it's an object with signer details
    const accountConfig =
      typeof account === 'object' && account !== null && 'remoteSignerUrl' in account
        ? (account as { address: string; remoteSignerUrl?: string; certPath?: string; certPass?: string })
        : null;
    const defaultConfig = this.options.defaultRemoteSigner;

    // Determine the URL to use
    let url: string;
    if (accountConfig?.remoteSignerUrl) {
      url = accountConfig.remoteSignerUrl;
    } else if (typeof defaultConfig === 'string') {
      url = defaultConfig;
    } else if (defaultConfig && typeof defaultConfig === 'object' && defaultConfig.remoteSignerUrl) {
      url = defaultConfig.remoteSignerUrl;
    } else {
      throw new AccountResolutionError('No remote signer URL available (not in account or default config)', path);
    }

    return {
      url,
      certPath:
        accountConfig?.certPath ||
        (typeof defaultConfig === 'object' && defaultConfig ? defaultConfig.certPath : undefined),
      certPass:
        accountConfig?.certPass ||
        (typeof defaultConfig === 'object' && defaultConfig ? defaultConfig.certPass : undefined),
    };
  }

  /**
   * Creates a new resolver with updated default options
   */
  private withDefaults(newDefaults: Partial<ResolverOptions>): AccountResolver {
    return new AccountResolver({ ...this.options, ...newDefaults });
  }

  // Type guards
  private isMnemonicConfig(account: unknown): account is EthMnemonicConfig {
    return typeof account === 'object' && account !== null && 'mnemonic' in account;
  }

  private isPrivateKey(account: unknown): account is EthPrivateKey {
    return typeof account === 'string' && /^0x[0-9a-fA-F]{64}$/.test(account);
  }

  private isJsonKeyFile(account: unknown): account is EthJsonKeyFileV3Config {
    return typeof account === 'object' && account !== null && 'path' in account;
  }

  private isRemoteSignerAccount(account: unknown): account is EthRemoteSignerAccount {
    if (typeof account === 'string') {
      // Check if it's an address (not a private key)
      return /^0x[0-9a-fA-F]{40}$/.test(account);
    }
    return typeof account === 'object' && account !== null && 'address' in account;
  }
}

/**
 * Convenience function to resolve a keystore with default options
 */
export async function resolveKeyStore(keystore: KeyStore, options?: ResolverOptions): Promise<ResolvedKeyStore> {
  const resolver = new AccountResolver(options);
  return resolver.resolveKeyStore(keystore);
}
