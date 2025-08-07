/**
 * Keys and Addresses Configuration Types
 *
 * TypeScript definitions based on the specification for validator keystore files.
 * These types define the JSON structure for configuring validators, provers, and
 * their associated keys and addresses.
 */
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/** A private key is a 32-byte 0x-prefixed hex */
export type EthPrivateKey = `0x${string}`;

/** An address is a 20-byte 0x-prefixed hex */
export type EthAddressHex = `0x${string}`;

/** An Aztec address is a 32-byte 0x-prefixed hex */
export type AztecAddressHex = `0x${string}`;

/** URL type for remote signers */
export type Url = string;

/**
 * A remote signer is configured as an URL to connect to, and optionally a client certificate to use for auth
 */
export type EthRemoteSignerConfig =
  | Url
  | {
      remoteSignerUrl: Url;
      certPath?: string;
      certPass?: string;
    };

/**
 * A remote signer account config is equal to the remote signer config, but requires an address to be specified.
 * If only the address is set, then the default remote signer config from the parent config is used.
 */
export type EthRemoteSignerAccount =
  | EthAddressHex
  | {
      address: EthAddressHex;
      remoteSignerUrl?: Url;
      certPath?: string;
      certPass?: string;
    };

/** A json keystore config points to a local file with the encrypted private key, and may require a password for decrypting it */
export type EthJsonKeyFileV3Config = {
  path: string;
  password?: string;
};

/** An L1 account is a private key, a remote signer configuration, or a standard json key store file */
export type EthAccount = EthPrivateKey | EthRemoteSignerAccount | EthJsonKeyFileV3Config;

/** A mnemonic can be used to define a set of accounts */
export type EthMnemonicConfig = {
  mnemonic: string;
  addressIndex?: number;
  accountIndex?: number;
  addressCount?: number;
  accountCount?: number;
};

/** One or more L1 accounts */
export type EthAccounts = EthAccount | EthAccount[] | EthMnemonicConfig;

export type ProverKeyStore =
  | {
      /** Address that identifies the prover. This address will receive the rewards. */
      id: EthAddressHex;
      /** One or more EOAs used for sending proof L1 txs. */
      publisher: EthAccounts[];
    }
  | EthAccount;

export type ValidatorKeyStore = {
  /**
   * One or more validator attester keys to handle in this configuration block.
   * An attester address may only appear once across all configuration blocks across all keystore files.
   */
  attester: EthAccounts;
  /**
   * Coinbase address to use when proposing an L2 block as any of the validators in this configuration block.
   * Falls back to the attester address if not set.
   */
  coinbase?: EthAddressHex;
  /**
   * One or more EOAs used for sending block proposal L1 txs for all validators in this configuration block.
   * Falls back to the attester account if not set.
   */
  publisher?: EthAccounts;
  /**
   * Fee recipient address to use when proposing an L2 block as any of the validators in this configuration block.
   */
  feeRecipient: AztecAddressHex;
  /**
   * Default remote signer for all accounts in this block.
   */
  remoteSigner?: EthRemoteSignerConfig;
};

export type KeyStore = {
  /** Schema version of this keystore file (initially 1). */
  schemaVersion: number;
  /** Validator configurations. */
  validators?: ValidatorKeyStore[];
  /** One or more accounts used for creating slash payloads on L1. Does not create slash payloads if not set. */
  slasher?: EthAccounts;
  /** Default config for the remote signer for all accounts in this file. */
  remoteSigner?: EthRemoteSignerConfig;
  /** Prover configuration. Only one prover configuration is allowed. */
  prover?: ProverKeyStore;
};

/**
 * Resolved account represents an account after processing the configuration.
 * All accounts are resolved to either a private key or a remote signer configuration.
 */
export type ResolvedAccount = {
  address: EthAddress;
  type: 'private-key' | 'remote-signer' | 'json-v3';
  privateKey?: EthPrivateKey;
  remoteSignerConfig?: {
    url: string;
    certPath?: string;
    certPass?: string;
  };
  jsonKeyFile?: {
    path: string;
    password?: string;
  };
};

/**
 * Resolved validator configuration after processing the keystore.
 */
export type ResolvedValidatorConfig = {
  /** Resolved attester accounts */
  attesters: ResolvedAccount[];
  /** Resolved publisher accounts (falls back to attesters if not specified) */
  publishers: ResolvedAccount[];
  /** Coinbase address (falls back to first attester if not specified) */
  coinbase: EthAddress;
  /** Fee recipient for L2 rewards */
  feeRecipient: AztecAddress;
};

/**
 * Resolved prover configuration after processing the keystore.
 */
export type ResolvedProverConfig = {
  /** Prover identifier address */
  id: EthAddress;
  /** Resolved publisher accounts */
  publishers: ResolvedAccount[];
};

/**
 * Complete resolved keystore configuration.
 */
export type ResolvedKeyStore = {
  /** Resolved validator configurations */
  validators: ResolvedValidatorConfig[];
  /** Resolved slasher accounts */
  slashers: ResolvedAccount[];
  /** Resolved prover configuration */
  prover?: ResolvedProverConfig;
};
