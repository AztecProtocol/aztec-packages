import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * Provides the directory of current L1 contract addresses
 */
export class L1ContractAddresses {
  constructor(
    /**
     * Rollup Address.
     */
    public rollupAddress?: EthAddress,
    /**
     * Registry Address.
     */
    public registryAddress?: EthAddress,
    /**
     * Inbox Address.
     */
    public inboxAddress?: EthAddress,
    /**
     * Outbox Address.
     */
    public outboxAddress?: EthAddress,
    /**
     * Data Emitter Address.
     */
    public contractDeploymentEmitterAddress?: EthAddress,
    /**
     * Decoder Helper Address.
     */
    public decoderHelperAddress?: EthAddress,
  ) {}

  /**
   * Serialize as JSON object.
   * @returns The string.
   */
  toJSON() {
    const obj: { [key: string]: string } = {};
    if (this.rollupAddress) {
      obj.rollupAddress = this.rollupAddress?.toString();
    }
    if (this.registryAddress) {
      obj.registryAddress = this.registryAddress?.toString();
    }
    if (this.inboxAddress) {
      obj.inboxAddress = this.inboxAddress?.toString();
    }
    if (this.outboxAddress) {
      obj.outboxAddress = this.outboxAddress?.toString();
    }
    if (this.contractDeploymentEmitterAddress) {
      obj.contractDeploymentEmitterAddress = this.contractDeploymentEmitterAddress?.toString();
    }
    if (this.decoderHelperAddress) {
      obj.decoderHelperAddress = this.decoderHelperAddress?.toString();
    }
    return obj;
  }

  /**
   * Deserializes from a JSON.
   * @param obj - object to read from
   * @returns The deserialized L1ContractAddresses object.
   */
  static fromJSON(obj: any): L1ContractAddresses {
    const fromString = (key: string) => {
      if (obj[key]) {
        return EthAddress.fromString(obj[key]);
      }
      return undefined;
    };
    return new L1ContractAddresses(
      fromString('rollupAddress'),
      fromString('registryAddress'),
      fromString('inboxAddress'),
      fromString('outboxAddress'),
      fromString('contractDeploymentEmitterAddress'),
      fromString('decoderHelperAddress'),
    );
  }
}
