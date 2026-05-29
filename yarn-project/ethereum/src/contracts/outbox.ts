import type { EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { OutboxAbi } from '@aztec/l1-artifacts/OutboxAbi';

import { type GetContractReturnType, type Hex, encodeAbiParameters, getContract, hexToBigInt, keccak256 } from 'viem';

import { getPublicClient } from '../client.js';
import type { DeployAztecL1ContractsReturnType } from '../deploy_aztec_l1_contracts.js';
import type { L1ReaderConfig } from '../l1_reader.js';
import { type ExtendedViemWalletClient, type ViemClient, isExtendedClient } from '../types.js';

export type ViemL1Actor = {
  actor: Hex;
  chainId: bigint;
};

export type ViemL2Actor = {
  actor: Hex;
  version: bigint;
};

export type ViemL2ToL1Msg = {
  sender: ViemL2Actor;
  recipient: ViemL1Actor;
  content: Hex;
};

export class OutboxContract {
  private readonly outbox: GetContractReturnType<typeof OutboxAbi, ViemClient>;

  static getFromL1ContractsValues(deployL1ContractsValues: DeployAztecL1ContractsReturnType) {
    const {
      l1Client,
      l1ContractAddresses: { outboxAddress },
    } = deployL1ContractsValues;
    return new OutboxContract(l1Client, outboxAddress.toString());
  }

  static getFromConfig(config: L1ReaderConfig) {
    const client = getPublicClient(config);
    const address = config.outboxAddress.toString();
    return new OutboxContract(client, address);
  }

  /**
   * Storage slot of `epochs[epoch].roots[numCheckpointsInEpoch - 1]` in the Outbox contract.
   *
   * The Outbox lays out storage as `mapping(Epoch => EpochData) internal epochs` at base slot 0
   * (ROLLUP and VERSION are immutable and do not occupy slots). For a mapping at slot `b`, the
   * value for key `k` begins at `keccak256(abi.encode(k, b))`. `EpochData` starts with a fixed-
   * size `bytes32[MAX_CHECKPOINTS_PER_EPOCH] roots` array, so `roots[i]` sits at the EpochData's
   * base slot plus `i`. `numCheckpointsInEpoch` is 1-indexed (matches `Outbox.insert`/`consume`).
   */
  static getEpochRootStorageSlot(epoch: EpochNumber, numCheckpointsInEpoch: number) {
    const epochDataSlot = hexToBigInt(
      keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [BigInt(epoch), 0n])),
    );
    return epochDataSlot + BigInt(numCheckpointsInEpoch - 1);
  }

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.outbox = getContract({ address, abi: OutboxAbi, client });
  }

  public get address() {
    return this.outbox.address;
  }

  public getContract(): GetContractReturnType<typeof OutboxAbi, ViemClient> {
    return this.outbox;
  }

  public hasMessageBeenConsumedAtEpoch(epoch: EpochNumber, leafId: bigint) {
    return this.outbox.read.hasMessageBeenConsumedAtEpoch([BigInt(epoch), leafId]);
  }

  public getRootData(epoch: EpochNumber, numCheckpointsInEpoch: number) {
    return this.outbox.read.getRootData([BigInt(epoch), BigInt(numCheckpointsInEpoch)]);
  }

  /**
   * Returns every root stored for `epoch`. Slot `i` of the returned array holds the root inserted
   * for `numCheckpointsInEpoch = i + 1`, or `Fr.ZERO` if no proof of that depth has been inserted
   * yet. The array length is always `MAX_CHECKPOINTS_PER_EPOCH`.
   */
  public async getRoots(epoch: EpochNumber): Promise<Fr[]> {
    const raw = await this.outbox.read.getRoots([BigInt(epoch)]);
    return raw.map(hex => Fr.fromString(hex));
  }

  public consume(
    message: ViemL2ToL1Msg,
    epoch: EpochNumber,
    numCheckpointsInEpoch: number,
    leafIndex: bigint,
    path: Hex[],
  ) {
    const wallet = this.assertWallet();
    return wallet.write.consume([message, BigInt(epoch), BigInt(numCheckpointsInEpoch), leafIndex, path]);
  }

  public async getMessageConsumedEvents(
    l1BlockHash: Hex,
  ): Promise<{ epoch: bigint; root: Hex; messageHash: Hex; leafId: bigint; numCheckpointsInEpoch: bigint }[]> {
    const events = await this.outbox.getEvents.MessageConsumed({}, { blockHash: l1BlockHash, strict: true });
    return events.map(event => ({
      epoch: event.args.epoch!,
      root: event.args.root!,
      messageHash: event.args.messageHash!,
      leafId: event.args.leafId!,
      numCheckpointsInEpoch: event.args.numCheckpointsInEpoch!,
    }));
  }

  private assertWallet(): GetContractReturnType<typeof OutboxAbi, ExtendedViemWalletClient> {
    if (!isExtendedClient(this.client)) {
      throw new Error('Wallet client is required for this operation');
    }
    return this.outbox as GetContractReturnType<typeof OutboxAbi, ExtendedViemWalletClient>;
  }
}
