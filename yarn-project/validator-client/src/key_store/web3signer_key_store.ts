import type { Buffer32 } from '@aztec/foundation/buffer';
import { normalizeSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import type { SigningContext } from '@aztec/validator-ha-signer/types';

import type { TypedDataDefinition } from 'viem';

import type { ValidatorKeyStore } from './interface.js';

/** Default hard timeout (ms) applied to each Web3Signer HTTP request. */
const DEFAULT_WEB3SIGNER_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Web3Signer Key Store
 *
 * An implementation of the Key store using Web3Signer remote signing service.
 * This implementation uses the Web3Signer JSON-RPC API for secp256k1 signatures.
 */
export class Web3SignerKeyStore implements ValidatorKeyStore {
  private readonly requestTimeoutMs: number;

  constructor(
    private addresses: EthAddress[],
    private baseUrl: string,
    requestTimeoutMs: number = DEFAULT_WEB3SIGNER_REQUEST_TIMEOUT_MS,
  ) {
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /**
   * Get the address of a signer by index
   *
   * @param index - The index of the signer
   * @returns the address
   */
  public getAddress(index: number): EthAddress {
    if (index >= this.addresses.length) {
      throw new Error(`Index ${index} is out of bounds.`);
    }
    return this.addresses[index];
  }

  /**
   * Get all addresses
   *
   * @returns all addresses
   */
  public getAddresses(): EthAddress[] {
    return this.addresses;
  }

  /**
   * Sign EIP-712 typed data with all keystore addresses
   * @param typedData - The complete EIP-712 typed data structure (domain, types, primaryType, message)
   * @param _context - Signing context (ignored by Web3SignerKeyStore, used for HA protection)
   * @return signatures
   */
  public signTypedData(typedData: TypedDataDefinition, _context: SigningContext): Promise<Signature[]> {
    return Promise.all(this.addresses.map(address => this.makeJsonRpcSignTypedDataRequest(address, typedData)));
  }

  /**
   * Sign EIP-712 typed data with a specific address
   * @param address - The address of the signer to use
   * @param typedData - The complete EIP-712 typed data structure (domain, types, primaryType, message)
   * @param _context - Signing context (ignored by Web3SignerKeyStore, used for HA protection)
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore or signing fails
   */
  public async signTypedDataWithAddress(
    address: EthAddress,
    typedData: TypedDataDefinition,
    _context: SigningContext,
  ): Promise<Signature> {
    if (!this.addresses.some(addr => addr.equals(address))) {
      throw new Error(`Address ${address.toString()} not found in keystore`);
    }

    return await this.makeJsonRpcSignTypedDataRequest(address, typedData);
  }

  /**
   * Sign a message with all keystore addresses using EIP-191 prefix
   *
   * @param message - The message to sign
   * @param _context - Signing context (ignored by Web3SignerKeyStore, used for HA protection)
   * @return signatures
   */
  public signMessage(message: Buffer32, _context: SigningContext): Promise<Signature[]> {
    return Promise.all(this.addresses.map(address => this.makeJsonRpcSignRequest(address, message)));
  }

  /**
   * Sign a message with a specific address using EIP-191 prefix
   * @param address - The address of the signer to use
   * @param message - The message to sign
   * @param _context - Signing context (ignored by Web3SignerKeyStore, used for HA protection)
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore or signing fails
   */
  public async signMessageWithAddress(
    address: EthAddress,
    message: Buffer32,
    _context: SigningContext,
  ): Promise<Signature> {
    if (!this.addresses.some(addr => addr.equals(address))) {
      throw new Error(`Address ${address.toString()} not found in keystore`);
    }
    return await this.makeJsonRpcSignRequest(address, message);
  }

  /**
   * Make a JSON-RPC sign request to Web3Signer using eth_sign
   * @param address - The Ethereum address to sign with
   * @param data - The data to sign
   * @returns The signature
   */
  private makeJsonRpcSignRequest(address: EthAddress, data: Buffer32): Promise<Signature> {
    // eth_sign automatically applies Ethereum message prefixing to the raw data.
    return this.sendSignRequest({
      jsonrpc: '2.0',
      method: 'eth_sign',
      params: [address.toString(), data.toString()],
      id: 1,
    });
  }

  private makeJsonRpcSignTypedDataRequest(address: EthAddress, typedData: TypedDataDefinition): Promise<Signature> {
    return this.sendSignRequest({
      jsonrpc: '2.0',
      method: 'eth_signTypedData',
      params: [address.toString(), JSON.stringify(typedData)],
      id: 1,
    });
  }

  /**
   * Send a JSON-RPC request to Web3Signer under a hard request timeout and parse the signature.
   * A timed-out or aborted request is surfaced as a clear timeout error rather than hanging, so a
   * slow or unreachable signer cannot stall an HA signing operation past its own timeout budget.
   */
  private async sendSignRequest(body: object): Promise<Signature> {
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (err) {
      if (
        (err instanceof Error || err instanceof DOMException) &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new Error(`Web3Signer request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Web3Signer request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    // Handle JSON-RPC response format
    if (result.error) {
      throw new Error(`Web3Signer JSON-RPC error: ${result.error.code} - ${result.error.message}`);
    }

    if (!result.result) {
      throw new Error('Invalid response from Web3Signer: no result found');
    }

    let signatureHex = result.result;

    // Ensure the signature has the 0x prefix
    if (!signatureHex.startsWith('0x')) {
      signatureHex = '0x' + signatureHex;
    }

    return normalizeSignature(Signature.fromString(signatureHex as `0x${string}`));
  }
}
