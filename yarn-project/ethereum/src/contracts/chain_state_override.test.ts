import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';

import { SimulationOverridesBuilder } from './chain_state_override.js';

describe('SimulationOverridesBuilder', () => {
  it('returns undefined when no overrides are configured', () => {
    expect(new SimulationOverridesBuilder().build()).toBeUndefined();
  });

  it('merges chain tips set across multiple withChainTips calls', () => {
    const plan = new SimulationOverridesBuilder()
      .withChainTips({ pending: CheckpointNumber(7) })
      .withChainTips({ proven: CheckpointNumber(3) })
      .build();

    expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(7), proven: CheckpointNumber(3) });
  });

  it('lets later withChainTips calls overwrite the same half', () => {
    const plan = new SimulationOverridesBuilder()
      .withChainTips({ pending: CheckpointNumber(7) })
      .withChainTips({ pending: CheckpointNumber(8) })
      .build();

    expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(8) });
  });

  it('throws when withPendingArchive is called without a pending chain-tip override', () => {
    expect(() => new SimulationOverridesBuilder().withPendingArchive(Fr.random())).toThrow(
      /withChainTips\(\{ pending \}\) must be called/,
    );
  });

  it('throws when withPendingArchive is called and only proven is set', () => {
    expect(() =>
      new SimulationOverridesBuilder().withChainTips({ proven: CheckpointNumber(3) }).withPendingArchive(Fr.random()),
    ).toThrow(/withChainTips\(\{ pending \}\) must be called/);
  });

  it('attaches archive override after pending chain-tip override is set', () => {
    const archive = Fr.random();
    const plan = new SimulationOverridesBuilder()
      .withChainTips({ pending: CheckpointNumber(7) })
      .withPendingArchive(archive)
      .build();

    expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(7) });
    expect(plan?.pendingCheckpointState?.archive).toEqual(archive);
  });

  it('SimulationOverridesBuilder.from copies chainTipsOverride', () => {
    const plan = new SimulationOverridesBuilder()
      .withChainTips({ pending: CheckpointNumber(7), proven: CheckpointNumber(3) })
      .build();

    const rebuilt = SimulationOverridesBuilder.from(plan).build();
    expect(rebuilt?.chainTipsOverride).toEqual({ pending: CheckpointNumber(7), proven: CheckpointNumber(3) });
  });

  it('merge folds chain tips per-half', () => {
    const builder = new SimulationOverridesBuilder().withChainTips({ pending: CheckpointNumber(7) });
    builder.merge({ chainTipsOverride: { proven: CheckpointNumber(3) } });
    const plan = builder.build();
    expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(7), proven: CheckpointNumber(3) });
  });

  it('accumulates per-checkpoint state across the new withPending* helpers', () => {
    const headerHash = Fr.random();
    const outHash = Fr.random();
    const payloadDigest = Buffer32.random();
    const slotNumber = SlotNumber(42);
    const plan = new SimulationOverridesBuilder()
      .withChainTips({ pending: CheckpointNumber(7) })
      .withPendingHeaderHash(headerHash)
      .withPendingOutHash(outHash)
      .withPendingPayloadDigest(payloadDigest)
      .withPendingSlotNumber(slotNumber)
      .build();

    expect(plan?.pendingCheckpointState).toEqual({ headerHash, outHash, payloadDigest, slotNumber });
  });
});
