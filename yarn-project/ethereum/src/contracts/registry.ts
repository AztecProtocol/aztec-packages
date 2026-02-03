import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RegistryAbi } from '@aztec/l1-artifacts/RegistryAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';

import { type GetContractReturnType, type Hex, getContract } from 'viem';

import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { ViemClient } from '../types.js';
import { ReadOnlyGovernanceContract } from './governance.js';
import { RollupContract } from './rollup.js';

export class RegistryContract {
  public address: EthAddress;

  private readonly log = createLogger('ethereum:contracts:registry');
  private readonly registry: GetContractReturnType<typeof RegistryAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.address = EthAddress.fromString(address);
    this.registry = getContract({ address, abi: RegistryAbi, client });
  }

  public async getOwner(): Promise<EthAddress> {
    return EthAddress.fromString(await this.registry.read.owner());
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

    try {
      return EthAddress.fromString(await this.registry.read.getRollup([version]));
    } catch {
      this.log.warn(`Failed fetching rollup address for version ${version}. Retrying as index.`);
    }

    try {
      const actualVersion = await this.registry.read.getVersion([version]);
      const rollupAddress = await this.registry.read.getRollup([actualVersion]);
      return EthAddress.fromString(rollupAddress);
    } catch {
      throw new Error('Rollup address is undefined');
    }
  }

  /**
   * Returns the canonical address of the rollup.
   * @returns The canonical address of the rollup. If the rollup is not set, throws an error.
   */
  public async getCanonicalAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.registry.read.getCanonicalRollup());
  }

  public async getGovernanceAddresses(): Promise<
    Pick<L1ContractAddresses, 'governanceProposerAddress' | 'governanceAddress'>
  > {
    const governanceAddress = await this.registry.read.getGovernance();
    const governance = new ReadOnlyGovernanceContract(governanceAddress, this.client);
    const governanceProposerAddress = await governance.getGovernanceProposerAddress();
    return {
      governanceAddress: governance.address,
      governanceProposerAddress: governanceProposerAddress,
    };
  }

  public static async collectAddresses(
    client: ViemClient,
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

  public async getNumberOfVersions(): Promise<number> {
    const version = await this.registry.read.numberOfVersions();
    return Number(version);
  }

  public async getRollupVersions(): Promise<bigint[]> {
    const count = await this.getNumberOfVersions();

    const versions: bigint[] = [];
    for (let i = 0; i < count; i++) {
      versions.push(await this.registry.read.getVersion([BigInt(i)]));
    }

    return versions;
  }

  public async getRewardDistributor(): Promise<EthAddress> {
    return EthAddress.fromString(await this.registry.read.getRewardDistributor());
  }
}
