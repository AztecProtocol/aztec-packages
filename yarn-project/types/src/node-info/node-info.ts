import { L1ContractAddresses } from '@aztec/ethereum';

/**
 * Provides basic information about the running node.
 */
export class NodeInfo {
  constructor(
    /**
     * Version as tracked in the aztec-packages repository.
     */
    public sandboxVersion: string,
    /**
     * The nargo version compatible with this sandbox version
     */
    public compatibleNargoVersion: string,
    /**
     * L1 chain id.
     */
    public chainId: number,
    /**
     * Protocol version.
     */
    public protocolVersion: number,
    /**
     * The deployed l1 contract addresses
     */
    public l1ContractAddresses: L1ContractAddresses,
  ) {}

  /**
   * Converts the Node Info to a readable string.
   * @returns A readable string contaiing the node info.
   */
  public toReadableString() {
    return `
    Sandbox Version: ${this.sandboxVersion}\n
    Compatible Nargo Version: ${this.compatibleNargoVersion}\n
    Chain Id: ${this.chainId}\n
    Protocol Version: ${this.protocolVersion}\n
    Rollup Address: ${this.l1ContractAddresses.rollupAddress?.toString()}
    `;
  }

  /**
   * Serialize as JSON object.
   * @returns The string.
   */
  toJSON() {
    return {
      sandboxVersion: this.sandboxVersion,
      compatibleNargoVersion: this.compatibleNargoVersion,
      chainId: this.chainId,
      protocolVersion: this.protocolVersion,
      l1ContractAddresses: this.l1ContractAddresses.toJSON(),
    };
  }

  /**
   * Deserializes from a JSON.
   * @param obj - String to read from.
   * @returns The deserialized NodeInfo object.
   */
  static fromJSON(obj: any): NodeInfo {
    return new NodeInfo(
      obj.sandboxVersion,
      obj.compatibleNargoVersion,
      obj.chainId,
      obj.protocolVersion,
      L1ContractAddresses.fromJSON(obj.l1ContractAddresses),
    );
  }
}
