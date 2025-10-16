import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';

import { type GetContractReturnType, getContract } from 'viem';

import type { ViemClient } from '../types.js';

/**
 * Typescript wrapper around the Slasher contract.
 */
export class SlasherContract {
  private contract: GetContractReturnType<typeof SlasherAbi, ViemClient>;

  constructor(
    private readonly client: ViemClient,
    private readonly address: EthAddress,
    private readonly log = createLogger('slasher-contract'),
  ) {
    this.contract = getContract({
      address: this.address.toString(),
      abi: SlasherAbi,
      client: this.client,
    });
  }

  /**
   * Checks if a slash payload is vetoed.
   * @param payloadAddress - The address of the payload to check
   * @returns True if the payload is vetoed, false otherwise
   */
  public async isPayloadVetoed(payloadAddress: EthAddress): Promise<boolean> {
    try {
      return await this.contract.read.vetoedPayloads([payloadAddress.toString()]);
    } catch (error) {
      this.log.error(`Error checking if payload ${payloadAddress} is vetoed`, error);
      throw error;
    }
  }

  /**
   * Checks if slashing is currently enabled. Slashing can be disabled by the vetoer.
   * @returns True if slashing is enabled, false otherwise
   */
  public async isSlashingEnabled(): Promise<boolean> {
    try {
      return await this.contract.read.isSlashingEnabled();
    } catch (error) {
      this.log.error(`Error checking if slashing is enabled`, error);
      throw error;
    }
  }

  /**
   * Gets the current vetoer address.
   * @returns The vetoer address
   */
  public async getVetoer(): Promise<EthAddress> {
    const vetoer = await this.contract.read.VETOER();
    return EthAddress.fromString(vetoer);
  }

  /**
   * Gets the disable duration by the vetoer.
   * @returns The disable duration in seconds
   */
  public async getSlashingDisableDuration(): Promise<number> {
    const duration = await this.contract.read.SLASHING_DISABLE_DURATION();
    return Number(duration);
  }

  /**
   * Gets the current governance address.
   * @returns The governance address
   */
  public async getGovernance(): Promise<EthAddress> {
    const governance = await this.contract.read.GOVERNANCE();
    return EthAddress.fromString(governance);
  }

  /**
   * Gets the current proposer address.
   * @returns The proposer address
   */
  public async getProposer(): Promise<EthAddress> {
    const proposer = await this.contract.read.PROPOSER();
    return EthAddress.fromString(proposer);
  }
}
