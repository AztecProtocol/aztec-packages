/**
 * Signer Interface and Implementations
 *
 * Common interface for different signing backends (local, remote, encrypted)
 */
/**
 * Signer Interface and Implementations
 *
 * Common interface for different signing backends (local, remote, encrypted)
 */
import type { EthSigner } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, toRecoveryBit } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import {
  type TransactionSerializable,
  type TypedDataDefinition,
  hashTypedData,
  keccak256,
  serializeTransaction,
} from 'viem';

import type { EthRemoteSignerConfig } from './types.js';

/**
 * Error thrown for remote signer HTTP or JSON-RPC failures
 */
export class SignerError extends Error {
  constructor(
    message: string,
    public method: 'eth_sign' | 'eth_signTypedData_v4',
    public url: string,
    public statusCode?: number,
    public errorCode?: number,
  ) {
    super(message);
    this.name = 'SignerError';
  }
}

/**
 * Local signer using in-memory private key
 */
/**
 * Local signer that holds an in-memory Secp256k1 private key.
 */
export class LocalSigner implements EthSigner {
  private readonly signer: Secp256k1Signer;

  constructor(private privateKey: Buffer32) {
    this.signer = new Secp256k1Signer(privateKey);
  }

  get address(): EthAddress {
    return this.signer.address;
  }

  signMessage(message: Buffer32): Promise<Signature> {
    return Promise.resolve(this.signer.signMessage(message));
  }

  signTypedData(typedData: TypedDataDefinition): Promise<Signature> {
    const digest = hashTypedData(typedData);
    return Promise.resolve(this.signer.sign(Buffer32.fromString(digest)));
  }

  signTransaction(transaction: TransactionSerializable): Promise<Signature> {
    const tx: TransactionSerializable =
      transaction.type === 'eip4844'
        ? {
            ...transaction,
            sidecars: false,
          }
        : transaction;
    const serializedTx = serializeTransaction(tx);
    const txHash = keccak256(serializedTx);
    const sig = this.signer.sign(Buffer32.fromString(txHash.slice(2)));
    return Promise.resolve(new Signature(sig.r, sig.s, toRecoveryBit(sig.v)));
  }
}

/**
 * Remote signer using Web3Signer HTTP API
 */
/**
 * Remote signer that proxies signing operations to a Web3Signer-compatible HTTP endpoint.
 */
export class RemoteSigner implements EthSigner {
  constructor(
    public readonly address: EthAddress,
    private readonly config: EthRemoteSignerConfig,
  ) {}

  /**
   * Sign a message using eth_sign via remote JSON-RPC.
   */
  async signMessage(message: Buffer32): Promise<Signature> {
    return await this.makeJsonRpcSignRequest(message);
  }

  /**
   * Sign typed data using eth_signTypedData_v4 via remote JSON-RPC.
   */
  async signTypedData(typedData: TypedDataDefinition): Promise<Signature> {
    return await this.makeJsonRpcSignTypedDataRequest(typedData);
  }

  signTransaction(_transaction: TransactionSerializable): Promise<Signature> {
    throw new Error('Method not implemented.');
  }

  /**
   * Make a JSON-RPC sign request using eth_sign
   */
  /**
   * Make a JSON-RPC eth_sign request.
   */
  private async makeJsonRpcSignRequest(data: Buffer32): Promise<Signature> {
    const url = this.getSignerUrl();

    const body = {
      jsonrpc: '2.0',
      method: 'eth_sign',
      params: [this.address.toString(), data.toString()],
      id: 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new SignerError(
        `Web3Signer request failed for eth_sign at ${url}: ${response.status} ${response.statusText} - ${errorText}`,
        'eth_sign',
        url,
        response.status,
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new SignerError(
        `Web3Signer JSON-RPC error for eth_sign at ${url}: ${result.error.code} - ${result.error.message}`,
        'eth_sign',
        url,
        undefined,
        result.error.code,
      );
    }

    if (!result.result) {
      throw new Error('Invalid response from Web3Signer: no result found');
    }

    let signatureHex = result.result;
    if (!signatureHex.startsWith('0x')) {
      signatureHex = '0x' + signatureHex;
    }

    return Signature.fromString(signatureHex as `0x${string}`);
  }

  /**
   * Make a JSON-RPC sign typed data request using eth_signTypedData_v4
   */
  /**
   * Make a JSON-RPC eth_signTypedData_v4 request.
   */
  private async makeJsonRpcSignTypedDataRequest(typedData: TypedDataDefinition): Promise<Signature> {
    const url = this.getSignerUrl();

    const body = {
      jsonrpc: '2.0',
      method: 'eth_signTypedData_v4',
      params: [this.address.toString(), typedData],
      id: 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new SignerError(
        `Web3Signer request failed for eth_signTypedData_v4 at ${url}: ${response.status} ${response.statusText} - ${errorText}`,
        'eth_signTypedData_v4',
        url,
        response.status,
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new SignerError(
        `Web3Signer JSON-RPC error for eth_signTypedData_v4 at ${url}: ${result.error.code} - ${result.error.message}`,
        'eth_signTypedData_v4',
        url,
        undefined,
        result.error.code,
      );
    }

    if (!result.result) {
      throw new Error('Invalid response from Web3Signer: no result found');
    }

    let signatureHex = result.result;
    if (!signatureHex.startsWith('0x')) {
      signatureHex = '0x' + signatureHex;
    }

    return Signature.fromString(signatureHex as `0x${string}`);
  }

  /**
   * Resolve the effective remote signer URL from config.
   */
  private getSignerUrl(): string {
    if (typeof this.config === 'string') {
      return this.config;
    }
    return this.config.remoteSignerUrl;
  }
}
