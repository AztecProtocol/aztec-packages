import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SimulationOverridesBuilder } from './chain_state_override.js';
import type { CheckpointLog, RollupContract } from './rollup.js';
import { RollupFeeReader } from './rollup_fee_reader.js';

const ROLLUP_ADDRESS = '0x1111111111111111111111111111111111111111';

describe('RollupFeeReader', () => {
  let rollup: MockProxy<RollupContract>;
  let reader: RollupFeeReader;
  let l1BlockNumber: bigint;

  // Translation methods return overrides whose content reflects their inputs, so two plans with
  // different content fingerprint differently while identical plans collide.
  const setupTranslation = () => {
    (rollup as unknown as { address: string }).address = ROLLUP_ADDRESS;
    rollup.makeChainTipsOverride.mockImplementation(override =>
      Promise.resolve([
        {
          address: ROLLUP_ADDRESS,
          stateDiff: [{ slot: '0x00', value: `0x${(override.pending ?? 0).toString(16).padStart(64, '0')}` }],
        },
      ]),
    );
    rollup.makeTempCheckpointLogOverride.mockImplementation((_n, fields) =>
      Promise.resolve([
        { address: ROLLUP_ADDRESS, stateDiff: [{ slot: '0x02', value: (fields.headerHash ?? Fr.ZERO).toString() }] },
      ]),
    );
    rollup.makeArchiveOverride.mockImplementation((_n, archive) => [
      { address: ROLLUP_ADDRESS, stateDiff: [{ slot: '0x01', value: archive.toString() }] },
    ]);
  };

  beforeEach(() => {
    rollup = mock<RollupContract>();
    l1BlockNumber = 1000n;
    (rollup as unknown as { client: { getBlockNumber: () => Promise<bigint> } }).client = {
      getBlockNumber: () => Promise.resolve(l1BlockNumber),
    };
    rollup.getManaMinFeeAt.mockResolvedValue(42n);
    rollup.getCheckpoint.mockResolvedValue({ feeHeader: {} } as CheckpointLog);
    setupTranslation();
    reader = new RollupFeeReader(rollup);
  });

  describe('getL1BlockNumber', () => {
    it('reads the current block number from the client', async () => {
      expect(await reader.getL1BlockNumber()).toBe(1000n);
      l1BlockNumber = 1005n;
      expect(await reader.getL1BlockNumber()).toBe(1005n);

      l1BlockNumber = 1002n;
      expect(await reader.getL1BlockNumber()).toBe(1002n);
    });
  });

  describe('getManaMinFeeAt', () => {
    it('serves repeated same-key reads from one underlying eth_call', async () => {
      await reader.getManaMinFeeAt(100n, true);
      await reader.getManaMinFeeAt(100n, true);

      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(1);
    });

    it('rotates the key when the L1 block advances', async () => {
      await reader.getManaMinFeeAt(100n, true);
      l1BlockNumber = 1001n;
      await reader.getManaMinFeeAt(100n, true);

      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('shares one eth_call between two plans that translate to identical override content', async () => {
      const planA = new SimulationOverridesBuilder()
        .withChainTips({ pending: CheckpointNumber(7), proven: CheckpointNumber(7) })
        .withL1BlockNumber(1000n)
        .build();
      // A distinct builder/plan object with the same content.
      const planB = new SimulationOverridesBuilder()
        .withChainTips({ pending: CheckpointNumber(7), proven: CheckpointNumber(7) })
        .withL1BlockNumber(1000n)
        .build();

      await reader.getManaMinFeeAt(100n, true, planA);
      await reader.getManaMinFeeAt(100n, true, planB);

      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(1);
    });

    it('recomputes when a single override field differs between two plans', async () => {
      const planA = new SimulationOverridesBuilder()
        .withChainTips({ pending: CheckpointNumber(7), proven: CheckpointNumber(7) })
        .withPendingTempCheckpointLogFields({ headerHash: Fr.fromString('0xaaaa') })
        .withL1BlockNumber(1000n)
        .build();
      const planB = new SimulationOverridesBuilder()
        .withChainTips({ pending: CheckpointNumber(7), proven: CheckpointNumber(7) })
        .withPendingTempCheckpointLogFields({ headerHash: Fr.fromString('0xbbbb') })
        .withL1BlockNumber(1000n)
        .build();

      await reader.getManaMinFeeAt(100n, true, planA);
      await reader.getManaMinFeeAt(100n, true, planB);

      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('shares one in-flight eth_call between concurrent same-key callers', async () => {
      let resolveCall: (v: bigint) => void = () => {};
      rollup.getManaMinFeeAt.mockReturnValueOnce(new Promise<bigint>(resolve => (resolveCall = resolve)));

      const first = reader.getManaMinFeeAt(100n, true);
      const second = reader.getManaMinFeeAt(100n, true);
      resolveCall(7n);

      expect(await first).toBe(7n);
      expect(await second).toBe(7n);
      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(1);
    });

    it('does not cache a rejected eth_call and retries on the next call', async () => {
      rollup.getManaMinFeeAt.mockRejectedValueOnce(new Error('rpc down'));

      await expect(reader.getManaMinFeeAt(100n, true)).rejects.toThrow('rpc down');
      await expect(reader.getManaMinFeeAt(100n, true)).resolves.toBe(42n);
      expect(rollup.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCheckpoint', () => {
    it('serves repeated same-block reads from one underlying call', async () => {
      await reader.getCheckpoint(CheckpointNumber(3));
      await reader.getCheckpoint(CheckpointNumber(3));

      expect(rollup.getCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('rotates the key when a different block number is pinned', async () => {
      await reader.getCheckpoint(CheckpointNumber(3), { blockNumber: 1000n });
      await reader.getCheckpoint(CheckpointNumber(3), { blockNumber: 1001n });

      expect(rollup.getCheckpoint).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSlotNumber', () => {
    it('serves repeated same-block reads from one underlying call', async () => {
      rollup.getSlotNumber.mockResolvedValue(SlotNumber(5));

      await reader.getSlotNumber();
      await reader.getSlotNumber();

      expect(rollup.getSlotNumber).toHaveBeenCalledTimes(1);
    });
  });
});
