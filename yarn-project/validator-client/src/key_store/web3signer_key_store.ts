import type { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import type { TypedDataDefinition } from 'viem';

import type { ValidatorKeyStore } from './interface.js';

/**
 * Web3Signer Key Store
 *
 * An implementation of the Key store using Web3Signer remote signing service.
 * This implementation uses the Web3Signer JSON-RPC API for secp256k1 signatures.
 */
export class Web3SignerKeyStore implements ValidatorKeyStore {
  constructor(
    private addresses: EthAddress[],
    private baseUrl: string,
  ) {}

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
   * @return signatures
   */
  public async signTypedData(typedData: TypedDataDefinition): Promise<Signature[]> {
    const signatures = await Promise.all(
      this.addresses.map(address => this.makeJsonRpcSignTypedDataRequest(address, typedData)),
    );
    return signatures;
  }

  /**
   * Sign EIP-712 typed data with a specific address
   * @param address - The address of the signer to use
   * @param typedData - The complete EIP-712 typed data structure (domain, types, primaryType, message)
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore or signing fails
   */
  public async signTypedDataWithAddress(address: EthAddress, typedData: TypedDataDefinition): Promise<Signature> {
    if (!this.addresses.some(addr => addr.equals(address))) {
      throw new Error(`Address ${address.toString()} not found in keystore`);
    }

    return await this.makeJsonRpcSignTypedDataRequest(address, typedData);
  }

  /**
   * Sign a message with all keystore addresses using EIP-191 prefix
   *
   * @param message - The message to sign
   * @return signatures
   */
  public async signMessage(message: Buffer32): Promise<Signature[]> {
    const signatures = await Promise.all(this.addresses.map(address => this.makeJsonRpcSignRequest(address, message)));
    return signatures;
  }

  /**
   * Sign a message with a specific address using EIP-191 prefix
   * @param address - The address of the signer to use
   * @param message - The message to sign
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore or signing fails
   */
  public async signMessageWithAddress(address: EthAddress, message: Buffer32): Promise<Signature> {
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
  private async makeJsonRpcSignRequest(address: EthAddress, data: Buffer32): Promise<Signature> {
    const url = this.baseUrl;

    // Use JSON-RPC eth_sign method which automatically applies Ethereum message prefixing
    const body = {
      jsonrpc: '2.0',
      method: 'eth_sign',
      params: [
        address.toString(), // Ethereum address as identifier
        data.toString(), // Raw data to sign (eth_sign will apply Ethereum message prefix)
      ],
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

    // Parse the signature from the hex string
    return Signature.fromString(signatureHex as `0x${string}`);
  }

  private async makeJsonRpcSignTypedDataRequest(
    address: EthAddress,
    typedData: TypedDataDefinition,
  ): Promise<Signature> {
    const url = this.baseUrl;

    const body = {
      jsonrpc: '2.0',
      method: 'eth_signTypedData',
      params: [address.toString(), JSON.stringify(typedData)],
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
      throw new Error(`Web3Signer request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

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

    return Signature.fromString(signatureHex as `0x${string}`);
  }
}
