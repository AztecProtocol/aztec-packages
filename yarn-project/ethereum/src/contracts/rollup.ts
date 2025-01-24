import { AztecAddress } from '@aztec/foundation/aztec-address';
import { memoize } from '@aztec/foundation/decorators';
import { RollupAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getContract,
  http,
} from 'viem';

import { type DeployL1Contracts } from '../deploy_l1_contracts.js';
import { createEthereumChain } from '../ethereum_chain.js';
import { type L1ReaderConfig } from '../l1_reader.js';

export class RollupContract {
  private readonly rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.rollup = getContract({ address, abi: RollupAbi, client });
  }

  public get address() {
    return AztecAddress.fromString(this.rollup.address);
  }

  @memoize
  getL1StartBlock() {
    return this.rollup.read.L1_BLOCK_AT_GENESIS();
  }

  @memoize
  getL1GenesisTime() {
    return this.rollup.read.GENESIS_TIME();
  }

  getBlockNumber() {
    return this.rollup.read.getPendingBlockNumber();
  }

  getProvenBlockNumber() {
    return this.rollup.read.getProvenBlockNumber();
  }

  getSlotNumber() {
    return this.rollup.read.getCurrentSlot();
  }

  getCommitteeAt(timestamp: bigint) {
    return this.rollup.read.getCommitteeAt([timestamp]);
  }

  getSampleSeedAt(timestamp: bigint) {
    return this.rollup.read.getSampleSeedAt([timestamp]);
  }

  getCurrentSampleSeed() {
    return this.rollup.read.getCurrentSampleSeed();
  }

  getCurrentEpochCommittee() {
    return this.rollup.read.getCurrentEpochCommittee();
  }

  getCurrentProposer() {
    return this.rollup.read.getCurrentProposer();
  }

  async getEpochNumber(blockNumber?: bigint) {
    blockNumber ??= await this.getBlockNumber();
    return this.rollup.read.getEpochForBlock([BigInt(blockNumber)]);
  }

  static getFromL1ContractsValues(deployL1ContractsValues: DeployL1Contracts) {
    const {
      publicClient,
      l1ContractAddresses: { rollupAddress },
    } = deployL1ContractsValues;
    return new RollupContract(publicClient, rollupAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = createPublicClient({
      transport: http(config.l1RpcUrl),
      chain: createEthereumChain(config.l1RpcUrl, config.l1ChainId).chainInfo,
    });
    const address = config.l1Contracts.rollupAddress.toString();
    return new RollupContract(client, address);
  }
}
