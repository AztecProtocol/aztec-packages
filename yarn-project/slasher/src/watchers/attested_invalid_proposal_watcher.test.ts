import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { P2PClient } from '@aztec/stdlib/interfaces/server';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import { OffenseType } from '@aztec/stdlib/slashing';
import {
  makeCheckpointAttestationFromProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { DefaultSlasherConfig, type SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { AttestedInvalidProposalWatcher, type InvalidProposalSlotSource } from './attested_invalid_proposal_watcher.js';

describe('AttestedInvalidProposalWatcher', () => {
  let p2pClient: MockProxy<Pick<P2PClient, 'getCheckpointAttestationsForSlot'>>;
  let l2BlockSource: MockProxy<Pick<L2BlockSource, 'getSyncedL2SlotNumber'>>;
  let epochCache: MockProxy<Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>>;
  let invalidProposalSlots: Set<SlotNumber>;
  let proposalEquivocationSlots: Set<SlotNumber>;
  let invalidProposalSlotSource: InvalidProposalSlotSource;
  let config: SlasherConfig;
  let watcher: AttestedInvalidProposalWatcher;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;

  beforeEach(() => {
    p2pClient = mock<Pick<P2PClient, 'getCheckpointAttestationsForSlot'>>();
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([]);
    l2BlockSource = mock<Pick<L2BlockSource, 'getSyncedL2SlotNumber'>>();
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(11));
    epochCache = mock<Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>>();
    epochCache.getSlotNow.mockReturnValue(SlotNumber(11));
    epochCache.getL1Constants.mockReturnValue({ ethereumSlotDuration: 4 } as ReturnType<
      EpochCacheInterface['getL1Constants']
    >);
    invalidProposalSlots = new Set();
    proposalEquivocationSlots = new Set();
    invalidProposalSlotSource = {
      hasInvalidProposals: slot => invalidProposalSlots.has(slot),
      hasProposalEquivocation: slot => proposalEquivocationSlots.has(slot),
    };
    config = {
      ...DefaultSlasherConfig,
      slashAttestInvalidCheckpointProposalPenalty: 13n,
    };
    watcher = new AttestedInvalidProposalWatcher(
      p2pClient,
      invalidProposalSlotSource,
      l2BlockSource,
      epochCache,
      config,
    );
    handler = jest.fn();
    watcher.on(WANT_TO_SLASH_EVENT, handler);
  });

  const makeAttestation = async (
    slot: SlotNumber,
    attesterSigner = Secp256k1Signer.random(),
  ): Promise<CheckpointAttestation> => {
    const checkpointProposal = await makeCheckpointProposal({
      checkpointHeader: makeCheckpointHeader(1, { slotNumber: slot }),
    });
    return makeCheckpointAttestationFromProposal(checkpointProposal, attesterSigner);
  };

  it('slashes checkpoint attestations already in the pool for a marked invalid proposal slot', async () => {
    const slot = SlotNumber(10);
    const attesterSigner = Secp256k1Signer.random();
    invalidProposalSlots.add(slot);
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([await makeAttestation(slot, attesterSigner)]);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: attesterSigner.address,
        amount: 13n,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('emits zero-amount offenses when the penalty is zero', async () => {
    const slot = SlotNumber(10);
    const attesterSigner = Secp256k1Signer.random();
    invalidProposalSlots.add(slot);
    watcher.updateConfig({ slashAttestInvalidCheckpointProposalPenalty: 0n });
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([await makeAttestation(slot, attesterSigner)]);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: attesterSigner.address,
        amount: 0n,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('deduplicates repeated scans for the same attester and slot', async () => {
    const slot = SlotNumber(10);
    invalidProposalSlots.add(slot);
    const attestation = await makeAttestation(slot);
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([attestation]);

    await watcher.scanSlot(slot);
    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('scans only marked invalid proposal slots once they are past the scan lag', async () => {
    watcher = new AttestedInvalidProposalWatcher(
      p2pClient,
      invalidProposalSlotSource,
      l2BlockSource,
      epochCache,
      config,
      { scanSlotLookback: 2 },
    );
    invalidProposalSlots = new Set([SlotNumber(8), SlotNumber(9), SlotNumber(10)]);

    await watcher.scan();

    expect(p2pClient.getCheckpointAttestationsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(9),
      SlotNumber(10),
    ]);
  });

  it('does not rescan completed slots', async () => {
    invalidProposalSlots = new Set([SlotNumber(9), SlotNumber(10)]);

    await watcher.scan();
    await watcher.scan();

    expect(p2pClient.getCheckpointAttestationsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(9),
      SlotNumber(10),
    ]);

    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(12));
    invalidProposalSlots = new Set([SlotNumber(9), SlotNumber(10), SlotNumber(11)]);
    await watcher.scan();

    expect(p2pClient.getCheckpointAttestationsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(9),
      SlotNumber(10),
      SlotNumber(11),
    ]);
  });

  it('does not slash attestations once proposal equivocation has been detected for the slot', async () => {
    const slot = SlotNumber(10);
    invalidProposalSlots.add(slot);
    proposalEquivocationSlots.add(slot);
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([await makeAttestation(slot)]);

    await watcher.scanSlot(slot);

    expect(handler).not.toHaveBeenCalled();
  });
});
