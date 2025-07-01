import type { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

import type { ValidatorKeyStore } from './interface.js';

/**
 * Local Key Store
 *
 * An implementation of the Key store using in memory private keys.
 */
export class LocalKeyStore implements ValidatorKeyStore {
  private signers: Secp256k1Signer[];
  private signersByAddress: Map<`0x${string}`, Secp256k1Signer>;

  constructor(privateKeys: Buffer32[]) {
    this.signers = privateKeys.map(privateKey => new Secp256k1Signer(privateKey));
    this.signersByAddress = new Map(this.signers.map(signer => [signer.address.toString(), signer]));
  }

  /**
   * Get the address of a signer by index
   *
   * @param index - The index of the signer
   * @returns the address
   */
  public getAddress(index: number): EthAddress {
    if (index >= this.signers.length) {
      throw new Error(`Index ${index} is out of bounds.`);
    }
    return this.signers[index].address;
  }

  /**
   * Get the addresses of all signers
   *
   * @returns the addresses
   */
  public getAddresses(): EthAddress[] {
    return this.signers.map(signer => signer.address);
  }

  /**
   * Sign a message with all keystore private keys
   * @param digest - The message buffer to sign
   * @return signature
   */
  public sign(digest: Buffer32): Promise<Signature[]> {
    return Promise.all(this.signers.map(signer => signer.sign(digest)));
  }

  /**
   * Sign a message with a specific address's private key
   * @param address - The address of the signer to use
   * @param digest - The message buffer to sign
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore
   */
  public signWithAddress(address: EthAddress, digest: Buffer32): Promise<Signature> {
    const signer = this.signersByAddress.get(address.toString());
    if (!signer) {
      throw new Error(`No signer found for address ${address.toString()}`);
    }
    return Promise.resolve(signer.sign(digest));
  }

  /**
   * Sign a message with all keystore private keys
   *
   * @param message - The message to sign
   * @return signatures
   */
  public signMessage(message: Buffer32): Promise<Signature[]> {
    return Promise.all(this.signers.map(signer => signer.signMessage(message)));
  }

  /**
   * Sign a message with a specific address's private key
   * @param address - The address of the signer to use
   * @param message - The message to sign
   * @returns signature for the specified address
   * @throws Error if the address is not found in the keystore
   */
  public signMessageWithAddress(address: EthAddress, message: Buffer32): Promise<Signature> {
    const signer = this.signersByAddress.get(address.toString());
    if (!signer) {
      throw new Error(`No signer found for address ${address.toString()}`);
    }
    return Promise.resolve(signer.signMessage(message));
  }
}
