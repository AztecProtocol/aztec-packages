import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { foundry } from 'viem/chains';

import { getPublicClient } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '../test/index.js';
import type { ViemClient } from '../types.js';
import { type FeeHeader, RollupContract, type RollupFeeRead, TempCheckpointLogField } from './rollup.js';

// Sequential execution: the ethereum package shares Anvil ports across suites.
describe('RollupContract fee reads', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;
  let rollup: RollupContract;
  let rollupCheatCodes: RollupCheatCodes;
  let cheatCodes: EthCheatCodes;
  let slotDuration: number;
  let l1GenesisTime: bigint;

  beforeAll(async () => {
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    ({ anvil, rpcUrl } = await startAnvil());
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    rollup = new RollupContract(publicClient, deployed.l1ContractAddresses.rollupAddress.toString());
    rollupCheatCodes = RollupCheatCodes.create([rpcUrl], deployed.l1ContractAddresses, new DateProvider());
    slotDuration = await rollup.getSlotDuration();
    l1GenesisTime = await rollup.getL1GenesisTime();
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error('Error stopping anvil', err));
  });

  function tsForSlot(slot: number): bigint {
    return l1GenesisTime + BigInt(slot) * BigInt(slotDuration);
  }

  /** Writes a checkpoint log (slot + fee header) into the Rollup's temp-checkpoint circular buffer via storage. */
  async function writeCheckpointLog(checkpointNumber: CheckpointNumber, slot: number, feeHeader: FeeHeader) {
    const address = EthAddress.fromString(rollup.address);
    const feeHeaderSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.FeeHeader,
    );
    await cheatCodes.store(address, feeHeaderSlot, RollupContract.compressFeeHeader(feeHeader));
    const slotNumberSlot = await rollup.getTempCheckpointLogStorageSlot(
      checkpointNumber,
      TempCheckpointLogField.SlotNumber,
    );
    await cheatCodes.store(address, slotNumberSlot, BigInt(slot) & ((1n << 32n) - 1n));
  }

  /** Sets the chain tips (pending, proven) directly via storage. */
  async function setTips(pending: CheckpointNumber, proven: CheckpointNumber) {
    await cheatCodes.store(
      EthAddress.fromString(rollup.address),
      RollupContract.chainTipsStorageSlot,
      RollupContract.packChainTips(BigInt(pending), BigInt(proven)),
    );
  }

  it('reads via Multicall3 identically to parallel individual pinned reads', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const { pending } = await rollup.getTips({ blockNumber });
    const currentSlot = await rollup.getSlotNumber({ blockNumber });
    const ts = tsForSlot(Number(currentSlot) + 1);

    const reads: RollupFeeRead[] = [
      { kind: 'tips' },
      { kind: 'manaTarget' },
      { kind: 'manaLimit' },
      { kind: 'provingCostPerManaEth' },
      { kind: 'manaMinFeeAt', timestamp: ts },
      { kind: 'canPruneAtTime', timestamp: ts },
      { kind: 'l1FeesAt', timestamp: ts },
      { kind: 'checkpoint', checkpointNumber: pending },
    ];

    const viaMulticall = await rollup.readFeeInputs(reads, { blockNumber, allowMulticall: true });
    const viaIndividual = await rollup.readFeeInputs(reads, { blockNumber, allowMulticall: false });

    expect(viaMulticall).toEqual(viaIndividual);
  });

  it('pins getManaMinFeeAt to a block number so later blocks do not change the read', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const currentSlot = await rollup.getSlotNumber({ blockNumber });
    const ts = tsForSlot(Number(currentSlot) + 1);

    const before = await rollup.getManaMinFeeAt(ts, true, { blockNumber });

    // Mine several blocks; the read pinned to the original block must be unchanged.
    await cheatCodes.mine(3);
    const afterPinned = await rollup.getManaMinFeeAt(ts, true, { blockNumber });
    expect(afterPinned).toBe(before);
  });

  it('reads governance values pinned and unmemoized, matching the memoized getters at the same block', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const [manaTarget, manaLimit, provingCost] = await Promise.all([
      rollup.readManaTarget({ blockNumber }),
      rollup.readManaLimit({ blockNumber }),
      rollup.readProvingCostPerManaInEth({ blockNumber }),
    ]);
    expect(manaTarget).toBe(await rollup.getManaTarget());
    expect(manaLimit).toBe(await rollup.getManaLimit());
    expect(provingCost).toBe(await rollup.getProvingCostPerMana());
  });

  it('supports a blockNumber option on getTips', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const pinned = await rollup.getTips({ blockNumber });
    const latest = await rollup.getTips();
    expect(pinned.pending).toBe(latest.pending);
    expect(pinned.proven).toBe(latest.proven);
  });

  describe('checkpoint-slot invariant', () => {
    it('holds pendingCheckpointSlot <= slot of the pinned block timestamp across advancing states', async () => {
      for (let i = 0; i < 3; i++) {
        const block = await publicClient.getBlock();
        const blockNumber = block.number!;
        const { pending } = await rollup.getTips({ blockNumber });
        const pendingCheckpoint = await rollup.getCheckpoint(pending, { blockNumber });
        const pinnedSlot = SlotNumber.fromBigInt((block.timestamp - l1GenesisTime) / BigInt(slotDuration));
        // A proposed checkpoint's slot equals the slot of its L1 inclusion timestamp, so it can never exceed
        // the slot of any later pinned block (ProposeLib require(slot == currentSlot)).
        expect(Number(pendingCheckpoint.slotNumber)).toBeLessThanOrEqual(Number(pinnedSlot));
        await rollupCheatCodes.advanceSlots(2);
        await cheatCodes.mine();
      }
    }, 30_000);

    it('holds with a pending checkpoint written at a non-zero slot across advancing states', async () => {
      // Write a real pending checkpoint at the current (non-zero) slot so the invariant is exercised with a
      // meaningful pendingCheckpointSlot rather than the genesis slot 0.
      const startBlock = await publicClient.getBlock();
      const startSlot = Number((startBlock.timestamp - l1GenesisTime) / BigInt(slotDuration));
      expect(startSlot).toBeGreaterThan(0);

      const feeHeader: FeeHeader = {
        excessMana: 0n,
        manaUsed: 0n,
        ethPerFeeAsset: 1_000_000_000_000n,
        congestionCost: 0n,
        proverCost: 0n,
      };
      await writeCheckpointLog(CheckpointNumber(1), startSlot, feeHeader);
      await setTips(CheckpointNumber(1), CheckpointNumber(0));

      try {
        for (let i = 0; i < 3; i++) {
          const block = await publicClient.getBlock();
          const blockNumber = block.number!;
          const { pending } = await rollup.getTips({ blockNumber });
          expect(pending).toBe(CheckpointNumber(1));
          const pendingCheckpoint = await rollup.getCheckpoint(pending, { blockNumber });
          const pinnedSlot = SlotNumber.fromBigInt((block.timestamp - l1GenesisTime) / BigInt(slotDuration));
          // The written pending checkpoint sits at a non-zero slot and never exceeds the pinned block's slot.
          expect(Number(pendingCheckpoint.slotNumber)).toBe(startSlot);
          expect(Number(pendingCheckpoint.slotNumber)).toBeLessThanOrEqual(Number(pinnedSlot));
          await rollupCheatCodes.advanceSlots(2);
          await cheatCodes.mine();
        }
      } finally {
        // Restore genesis tips so the written state does not leak into other tests.
        await setTips(CheckpointNumber(0), CheckpointNumber(0));
      }
    }, 30_000);
  });
});
