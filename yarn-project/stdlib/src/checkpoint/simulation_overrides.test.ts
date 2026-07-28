import { type FeeHeader, RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';

import { mock } from 'jest-mock-extended';

import type { CoordinationSignatureContext } from '../p2p/signature_utils.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { ProposedCheckpointData } from './checkpoint_data.js';
import { buildCheckpointSimulationOverridesPlan, computePipelinedParentFeeHeader } from './simulation_overrides.js';

describe('computePipelinedParentFeeHeader', () => {
  let rollup: ReturnType<typeof mock<RollupContract>>;

  beforeEach(() => {
    rollup = mock<RollupContract>();
  });

  // Use checkpoint 3 so the grandparent (checkpoint 1) is valid
  const pipelinedCheckpointNumber = CheckpointNumber(3);

  const pendingData: ProposedCheckpointData = {
    checkpointNumber: CheckpointNumber(2),
    header: CheckpointHeader.empty(),
    archive: AppendOnlyTreeSnapshot.empty(),
    checkpointOutHash: Fr.ZERO,
    startBlock: BlockNumber(2),
    blockCount: 1,
    totalManaUsed: 5000n,
    feeAssetPriceModifier: 100n,
    inboxMsgTotal: 0n,
  };

  const grandparentFeeHeader: FeeHeader = {
    manaUsed: 3000n,
    excessMana: 1000n,
    ethPerFeeAsset: 500n,
    congestionCost: 50n,
    proverCost: 10n,
  };

  it('returns undefined when checkpoint number is below 2 (genesis grandparent)', async () => {
    const result = await computePipelinedParentFeeHeader({
      checkpointNumber: CheckpointNumber(1),
      proposedCheckpointData: pendingData,
      rollup,
      log: createLogger('test'),
    });
    expect(result).toBeUndefined();
  });

  function mockRollup(overrides: { grandparentCheckpoint?: any; manaTarget?: bigint }) {
    rollup.getCheckpoint.mockResolvedValue(overrides.grandparentCheckpoint);
    rollup.getManaTarget.mockResolvedValue(overrides.manaTarget ?? 10_000n);
  }

  it('computes fee header from grandparent checkpoint', async () => {
    const manaTarget = 10_000n;

    mockRollup({ grandparentCheckpoint: { feeHeader: grandparentFeeHeader }, manaTarget });

    const result = await computePipelinedParentFeeHeader({
      checkpointNumber: pipelinedCheckpointNumber,
      proposedCheckpointData: pendingData,
      rollup,
      log: createLogger('test'),
    });

    expect(result).toBeDefined();

    const expected = RollupContract.computeChildFeeHeader(
      grandparentFeeHeader,
      pendingData.totalManaUsed,
      pendingData.feeAssetPriceModifier,
      manaTarget,
    );
    expect(result).toEqual(expected);
  });

  it('throws when grandparent checkpoint is not found', async () => {
    mockRollup({ grandparentCheckpoint: undefined });

    await expect(
      computePipelinedParentFeeHeader({
        checkpointNumber: pipelinedCheckpointNumber,
        proposedCheckpointData: pendingData,
        rollup,
        log: createLogger('test'),
      }),
    ).rejects.toThrow(/Grandparent checkpoint or feeHeader missing/);
  });

  it('throws when grandparent checkpoint has no feeHeader', async () => {
    mockRollup({ grandparentCheckpoint: { feeHeader: undefined } });

    await expect(
      computePipelinedParentFeeHeader({
        checkpointNumber: pipelinedCheckpointNumber,
        proposedCheckpointData: pendingData,
        rollup,
        log: createLogger('test'),
      }),
    ).rejects.toThrow(/Grandparent checkpoint or feeHeader missing/);
  });

  it('propagates errors from rollup calls', async () => {
    rollup.getCheckpoint.mockRejectedValue(new Error('rpc error'));

    await expect(
      computePipelinedParentFeeHeader({
        checkpointNumber: pipelinedCheckpointNumber,
        proposedCheckpointData: pendingData,
        rollup,
        log: createLogger('test'),
      }),
    ).rejects.toThrow(/rpc error/);
  });
});

describe('buildCheckpointSimulationOverridesPlan', () => {
  let rollup: ReturnType<typeof mock<RollupContract>>;

  const chainId = new Fr(12345);
  const signatureContext: CoordinationSignatureContext = {
    chainId: chainId.toNumber(),
    rollupAddress: EthAddress.random(),
  };

  beforeEach(() => {
    rollup = mock<RollupContract>();
  });

  const checkpointNumberUnderTest = CheckpointNumber(2);

  const grandparentFeeHeader: FeeHeader = {
    manaUsed: 3000n,
    excessMana: 1000n,
    ethPerFeeAsset: 500n,
    congestionCost: 50n,
    proverCost: 10n,
  };

  function mockGrandparentFeeHeader() {
    rollup.getCheckpoint.mockResolvedValue({ feeHeader: grandparentFeeHeader } as any);
    rollup.getManaTarget.mockResolvedValue(10_000n);
  }

  function makeProposedParent(checkpointNumber: CheckpointNumber): ProposedCheckpointData {
    return {
      checkpointNumber,
      header: CheckpointHeader.empty(),
      archive: new AppendOnlyTreeSnapshot(Fr.random(), 1),
      checkpointOutHash: Fr.random(),
      startBlock: BlockNumber(1),
      blockCount: 1,
      totalManaUsed: 5000n,
      feeAssetPriceModifier: 100n,
      inboxMsgTotal: 1500n,
    };
  }

  it('pins both pending and proven to the snapshot when no proposed/invalidate input is provided', async () => {
    const plan = await buildCheckpointSimulationOverridesPlan({
      checkpointNumber: checkpointNumberUnderTest,
      checkpointedCheckpointNumber: CheckpointNumber(4),
      rollup,
      signatureContext,
      log: createLogger('test'),
    });
    expect(plan?.chainTipsOverride?.pending).toEqual(CheckpointNumber(4));
    expect(plan?.chainTipsOverride?.proven).toEqual(CheckpointNumber(4));
    expect(plan?.pendingCheckpointState).toBeUndefined();
  });

  it('overrides the full pending checkpoint cell from a pipelined parent', async () => {
    mockGrandparentFeeHeader();
    const proposedData = makeProposedParent(CheckpointNumber(1));

    const plan = await buildCheckpointSimulationOverridesPlan({
      checkpointNumber: checkpointNumberUnderTest,
      proposedCheckpointData: proposedData,
      checkpointedCheckpointNumber: CheckpointNumber(0),
      rollup,
      signatureContext,
      log: createLogger('test'),
    });

    expect(plan?.chainTipsOverride?.pending).toEqual(CheckpointNumber(1));
    expect(plan?.chainTipsOverride?.proven).toEqual(CheckpointNumber(1));
    expect(plan?.pendingCheckpointState?.archive).toEqual(proposedData.archive.root);
    expect(plan?.pendingCheckpointState?.slotNumber).toEqual(proposedData.header.slotNumber);
    expect(plan?.pendingCheckpointState?.headerHash).toEqual(proposedData.header.hash());
    expect(plan?.pendingCheckpointState?.outHash).toEqual(proposedData.checkpointOutHash);
    expect(plan?.pendingCheckpointState?.payloadDigest).toBeDefined();
    expect(plan?.pendingCheckpointState?.feeHeader).toBeDefined();
    // Without this the parent reads as having consumed no Inbox messages, inflating the child's consumed count.
    expect(plan?.pendingCheckpointState?.inboxMsgTotal).toEqual(proposedData.inboxMsgTotal);
  });

  it('throws when the pipelined parent does not match the expected parent checkpoint', async () => {
    const proposedData = makeProposedParent(CheckpointNumber(5));

    await expect(
      buildCheckpointSimulationOverridesPlan({
        checkpointNumber: checkpointNumberUnderTest,
        proposedCheckpointData: proposedData,
        checkpointedCheckpointNumber: CheckpointNumber(0),
        rollup,
        signatureContext,
        log: createLogger('test'),
      }),
    ).rejects.toThrow(/does not match expected parent/);
  });

  it('throws when both proposedCheckpointData and invalidateToPendingCheckpointNumber are provided', async () => {
    const proposedData = makeProposedParent(CheckpointNumber(1));

    await expect(
      buildCheckpointSimulationOverridesPlan({
        checkpointNumber: checkpointNumberUnderTest,
        proposedCheckpointData: proposedData,
        invalidateToPendingCheckpointNumber: CheckpointNumber(0),
        checkpointedCheckpointNumber: CheckpointNumber(0),
        rollup,
        signatureContext,
        log: createLogger('test'),
      }),
    ).rejects.toThrow(/mutually exclusive/);
  });

  it('sets pending and proven from an invalidation rollback without archive/fee overrides', async () => {
    const plan = await buildCheckpointSimulationOverridesPlan({
      checkpointNumber: checkpointNumberUnderTest,
      invalidateToPendingCheckpointNumber: CheckpointNumber(0),
      checkpointedCheckpointNumber: CheckpointNumber(2),
      rollup,
      signatureContext,
      log: createLogger('test'),
    });
    expect(plan?.chainTipsOverride?.pending).toEqual(CheckpointNumber(0));
    expect(plan?.chainTipsOverride?.proven).toEqual(CheckpointNumber(0));
    expect(plan?.pendingCheckpointState).toBeUndefined();
  });
});
