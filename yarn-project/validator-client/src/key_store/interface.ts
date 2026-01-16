import type { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import type { EthRemoteSignerConfig } from '@aztec/node-keystore';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { TypedDataDefinition } from 'viem';

/** Key Store
 *
 * A keystore interface that can be replaced with a local keystore / remote signer service
 */
export interface ValidatorKeyStore {
  /**
   * Get the address of a signer by index
   *
   * @param index - The index of the signer
   * @returns the address
   */
  getAddress(index: number): EthAddress;

  /**
   * Get all addresses
   *
   * @returns all addresses
   */
  getAddresses(): EthAddress[];

  signTypedData(typedData: TypedDataDefinition): Promise<Signature[]>;
  signTypedDataWithAddress(address: EthAddress, typedData: TypedDataDefinition): Promise<Signature>;
  /**
   * Flavor of sign message that followed EIP-712 eth signed message prefix
   * Note: this is only required when we are using ecdsa signatures over secp256k1
   *
   * @param message - The message to sign.
   * @returns The signatures.
   */
  signMessage(message: Buffer32): Promise<Signature[]>;
  signMessageWithAddress(address: EthAddress, message: Buffer32): Promise<Signature>;
}

/**
 * Extended ValidatorKeyStore interface that supports the new keystore configuration model
 * with role-based address management (attester, coinbase, publisher, fee recipient)
 */
export interface ExtendedValidatorKeyStore extends ValidatorKeyStore {
  /**
   * Get all attester addresses (maps to existing getAddresses())
   * @returns all attester addresses
   */
  getAttesterAddresses(): EthAddress[];

  /**
   * Get the coinbase address for a specific attester
   * Falls back to the attester address if not set
   * @param attesterAddress - The attester address to find the coinbase for
   * @returns the coinbase address
   */
  getCoinbaseAddress(attesterAddress: EthAddress): EthAddress;

  /**
   * Get all publisher addresses for a specific attester (EOAs used for sending block proposal L1 txs)
   * Falls back to the attester addresses if not set
   * @param attesterAddress - The attester address to find the publishers for
   * @returns all publisher addresses for this validator
   */
  getPublisherAddresses(attesterAddress: EthAddress): EthAddress[];

  /**
   * Get the fee recipient address for a specific attester
   * @param attesterAddress - The attester address to find the fee recipient for
   * @returns the fee recipient address
   */
  getFeeRecipient(attesterAddress: EthAddress): AztecAddress;

  /**
   * Get the remote signer configuration for a specific attester if available
   * @param attesterAddress - The attester address to find the remote signer config for
   * @returns the remote signer configuration or undefined
   */
  getRemoteSignerConfig(attesterAddress: EthAddress): EthRemoteSignerConfig | undefined;
}
