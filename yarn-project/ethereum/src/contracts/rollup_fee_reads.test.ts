import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { foundry } from 'viem/chains';

import { getPublicClient } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { type Anvil, EthCheatCodes, RollupCheatCodes, startAnvil } from '../test/index.js';
import type { ViemClient } from '../types.js';
import { RollupContract, type RollupFeeRead } from './rollup.js';

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
  });
});
