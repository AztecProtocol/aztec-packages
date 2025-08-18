/**
 * Common interface for all signer implementations
 */
import type { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

import type { TransactionSerializable, TypedDataDefinition } from 'viem';

/**
 * Abstraction for signing operations used by the node keystore.
 */
export interface EthSigner {
  /** The Ethereum address for this signer */
  readonly address: EthAddress;

  /** Sign a message using eth_sign (with Ethereum message prefix) */
  signMessage(message: Buffer32): Promise<Signature>;

  /** Sign typed data using EIP-712 */
  signTypedData(typedData: TypedDataDefinition): Promise<Signature>;

  /** Sign a transaction */
  signTransaction(transaction: TransactionSerializable): Promise<Signature>;
}
