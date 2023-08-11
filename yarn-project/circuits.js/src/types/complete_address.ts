import { AztecAddress } from "@aztec/foundation/aztec-address";
import { PublicKey } from "./public_key.js";
import { PartialAddress } from "./partial_address.js";
import { CircuitsWasm, Fr, Point, PrivateKey } from "../index.js";
import { Grumpkin } from "../barretenberg/index.js";
import { computeContractAddressFromPartial } from "../abis/abis.js";

/**
 * A complete address is a combination of an Aztec address, a public key and a partial address.
 *
 * @remarks We have introduced this type because it is common that these 3 values are used together. They are commonly
 *          used together because it is the information needed to send user a note.
 * @remarks See the link bellow for details about how address is computed:
 *          https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys
 */
export class CompleteAddress {
  constructor(
    /** Contract address (typically of an account contract) */
    public address: AztecAddress,
    /** Public key corresponding to the address (used during note encryption). */
    public publicKey: PublicKey,
    /** Partial key corresponding to the public key to the address. */
    public partialAddress: PartialAddress,
  ) {
    // TODO: add the address derivation check
    // https://github.com/AztecProtocol/aztec-packages/blob/676c939191373808796b361a4f1bec2960b8730d/yarn-project/aztec-rpc/src/aztec_rpc_server/aztec_rpc_server.ts#L97
  }

  static async random(): Promise<CompleteAddress> {
    const partialAddress = Fr.random();
    const pubKey = Point.random();
    const wasm = await CircuitsWasm.get();
    const address = computeContractAddressFromPartial(wasm, pubKey, partialAddress);
    return new CompleteAddress(address, pubKey, partialAddress);
  }

  static async fromPrivateKey(privateKey: PrivateKey): Promise<CompleteAddress> {
    const wasm = await CircuitsWasm.get();
    const grumpkin = new Grumpkin(wasm);
    const pubKey = grumpkin.mul(Grumpkin.generator, privateKey);
    const partialAddress = Fr.random();
    const address = computeContractAddressFromPartial(wasm, pubKey, partialAddress);
    return new CompleteAddress(address, pubKey, partialAddress);
  }

  /**
   * Gets a string representation of the complete address.
   * @returns A string representation of the complete address.
   */
  public toString(): string {
    return `Address: ${this.address.toString()}, Public Key: ${this.publicKey.toString()}, Partial Address: ${this.partialAddress.toString()}`;
  }
}
