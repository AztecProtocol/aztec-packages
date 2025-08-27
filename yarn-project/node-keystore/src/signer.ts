/**
 * Signer Interface and Implementations
 *
 * Common interface for different signing backends (local, remote, encrypted)
 */
import type { EthSigner } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, toRecoveryBit } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature, type ViemTransactionSignature } from '@aztec/foundation/eth-signature';
import { withHexPrefix } from '@aztec/foundation/string';

import {
  type TransactionSerializable,
  type TypedDataDefinition,
  hashTypedData,
  keccak256,
  parseTransaction,
  serializeTransaction,
} from 'viem';

import type { EthRemoteSignerConfig } from './types.js';

/**
 * Error thrown for remote signer HTTP or JSON-RPC failures
 */
export class SignerError extends Error {
  constructor(
    message: string,
    public method: 'eth_sign' | 'eth_signTransaction' | 'eth_signTypedData_v4',
    public url: string,
    public statusCode?: number,
    public errorCode?: number,
  ) {
    super(message);
    this.name = 'SignerError';
  }
}

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
    // Taken from viem's `signTransaction` implementation
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

// reference - https://docs.web3signer.consensys.io/reference/api/json-rpc#eth_signtransaction
type RemoteSignerTxObject = {
  from: string;
  to?: string | null;
  gas?: string;
  maxPriorityFeePerGas?: string;
  maxFeePerGas?: string;
  nonce?: string;
  value?: string;
  data?: string;

  // EIP-4844 extension - https://github.com/Consensys/web3signer/pull/1096
  maxFeePerBlobGas?: string;
  blobVersionedHashes?: readonly string[];
  blobs?: readonly string[];
};

/**
 * Remote signer that proxies signing operations to a Web3Signer-compatible HTTP endpoint.
 */
export class RemoteSigner implements EthSigner {
  constructor(
    public readonly address: EthAddress,
    private readonly config: EthRemoteSignerConfig,
    private fetch: typeof globalThis.fetch = globalThis.fetch,
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

  signTransaction(transaction: TransactionSerializable): Promise<Signature> {
    return this.makeJsonRpcSignTransactionRequest(transaction);
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

    const response = await this.fetch(url, {
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

    const response = await this.fetch(url, {
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
   * Make a JSON-RPC eth_signTransaction request.
   */
  private async makeJsonRpcSignTransactionRequest(tx: TransactionSerializable): Promise<Signature> {
    if (tx.type !== 'eip1559') {
      throw new Error('This signer does not support tx type: ' + tx.type);
    }

    const url = this.getSignerUrl();

    const txObject: RemoteSignerTxObject = {
      from: this.address.toString(),
      to: tx.to ?? null,
      data: tx.data,
      value: typeof tx.value !== 'undefined' ? withHexPrefix(tx.value.toString(16)) : undefined,
      nonce: typeof tx.nonce !== 'undefined' ? withHexPrefix(tx.nonce.toString(16)) : undefined,
      gas: typeof tx.gas !== 'undefined' ? withHexPrefix(tx.gas.toString(16)) : undefined,
      maxFeePerGas: typeof tx.maxFeePerGas !== 'undefined' ? withHexPrefix(tx.maxFeePerGas.toString(16)) : undefined,
      maxPriorityFeePerGas:
        typeof tx.maxPriorityFeePerGas !== 'undefined'
          ? withHexPrefix(tx.maxPriorityFeePerGas.toString(16))
          : undefined,

      // maxFeePerBlobGas:
      //   typeof tx.maxFeePerBlobGas !== 'undefined' ? withHexPrefix(tx.maxFeePerBlobGas.toString(16)) : undefined,
      // blobVersionedHashes: tx.blobVersionedHashes,
      // blobs: tx.blobs?.map(blob => (typeof blob === 'string' ? blob : bufferToHex(Buffer.from(blob)))),
    };

    const body = {
      jsonrpc: '2.0',
      method: 'eth_signTransaction',
      params: [txObject],
      id: 1,
    };

    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new SignerError(
        `Web3Signer request failed for eth_signTransaction at ${url}: ${response.status} ${response.statusText} - ${errorText}`,
        'eth_signTransaction',
        url,
        response.status,
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new SignerError(
        `Web3Signer JSON-RPC error for eth_signTransaction at ${url}: ${result.error.code} - ${result.error.message}`,
        'eth_signTransaction',
        url,
        undefined,
        result.error.code,
      );
    }

    if (!result.result) {
      throw new Error('Invalid response from Web3Signer: no result found');
    }

    let rawTxHex = result.result;
    if (!rawTxHex.startsWith('0x')) {
      rawTxHex = '0x' + rawTxHex;
    }

    // we get back to whole signed tx. Deserialize it in order to read the signature
    const parsedTxWithSignature = parseTransaction(rawTxHex);
    if (
      parsedTxWithSignature.r === undefined ||
      parsedTxWithSignature.s === undefined ||
      parsedTxWithSignature.v === undefined
    ) {
      throw new Error('Tx not signed by Web3Signer');
    }

    return Signature.fromViemTransactionSignature(parsedTxWithSignature as ViemTransactionSignature);
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
