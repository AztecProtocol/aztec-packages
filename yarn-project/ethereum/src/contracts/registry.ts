import { EthAddress } from '@aztec/foundation/eth-address';
import { RegistryAbi } from '@aztec/l1-artifacts/RegistryAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  getContract,
} from 'viem';

import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { L1Clients, ViemPublicClient } from '../types.js';
import { GovernanceContract } from './governance.js';
import { RollupContract } from './rollup.js';

export class RegistryContract {
  public address: EthAddress;
  private readonly registry: GetContractReturnType<typeof RegistryAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: L1Clients['publicClient'], address: Hex | EthAddress) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.address = EthAddress.fromString(address);
    this.registry = getContract({ address, abi: RegistryAbi, client });
  }

  /**
   * Returns the address of the rollup for a given version.
   * @param version - The version of the rollup. 'canonical' can be used to get the canonical address (i.e. the latest version).
   * @returns The address of the rollup. If the rollup is not set for this version, throws an error.
   */
  public async getRollupAddress(version: number | bigint | 'canonical'): Promise<EthAddress> {
    if (version === 'canonical') {
      return this.getCanonicalAddress();
    }

    if (typeof version === 'number') {
      version = BigInt(version);
    }

    const snapshot = await this.registry.read.getSnapshot([version]);
    const address = EthAddress.fromString(snapshot.rollup);
    if (address.equals(EthAddress.ZERO)) {
      throw new Error('Rollup address is undefined');
    }
    return address;
  }

  /**
   * Returns the canonical address of the rollup.
   * @returns The canonical address of the rollup. If the rollup is not set, throws an error.
   */
  public async getCanonicalAddress(): Promise<EthAddress> {
    const snapshot = await this.registry.read.getCurrentSnapshot();
    const address = EthAddress.fromString(snapshot.rollup);
    if (address.equals(EthAddress.ZERO)) {
      throw new Error('Rollup address is undefined');
    }
    return address;
  }

  public async getGovernanceAddresses(): Promise<
    Pick<L1ContractAddresses, 'governanceProposerAddress' | 'governanceAddress'>
  > {
    const governanceAddress = await this.registry.read.getGovernance();
    const governance = new GovernanceContract(governanceAddress, this.client, undefined);
    const governanceProposer = await governance.getProposer();
    return {
      governanceAddress: governance.address,
      governanceProposerAddress: governanceProposer.address,
    };
  }

  public static async collectAddresses(
    client: ViemPublicClient,
    registryAddress: Hex | EthAddress,
    rollupVersion: number | bigint | 'canonical',
  ): Promise<L1ContractAddresses> {
    const registry = new RegistryContract(client, registryAddress);
    const governanceAddresses = await registry.getGovernanceAddresses();
    const rollupAddress = await registry.getRollupAddress(rollupVersion);

    if (rollupAddress === undefined) {
      throw new Error('Rollup address is undefined');
    }

    const rollup = new RollupContract(client, rollupAddress);
    const addresses = await rollup.getRollupAddresses();
    const feeAsset = getContract({
      address: addresses.feeJuiceAddress.toString(),
      abi: TestERC20Abi,
      client,
    });
    const coinIssuer = await feeAsset.read.owner();
    return {
      registryAddress: registry.address,
      ...governanceAddresses,
      ...addresses,
      coinIssuerAddress: EthAddress.fromString(coinIssuer),
    };
  }
}
