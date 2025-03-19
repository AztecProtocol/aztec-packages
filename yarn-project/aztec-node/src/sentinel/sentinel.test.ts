import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import {
  type L2BlockSource,
  type L2BlockStream,
  type PublishedL2Block,
  randomPublishedL2Block,
} from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockAttestation } from '@aztec/stdlib/p2p';
import { makeBlockAttestation } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { Sentinel } from './sentinel.js';
import { SentinelStore } from './store.js';

describe('sentinel', () => {
  let epochCache: MockProxy<EpochCache>;
  let archiver: MockProxy<L2BlockSource>;
  let p2p: MockProxy<P2PClient>;
  let blockStream: MockProxy<L2BlockStream>;

  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;

  let sentinel: TestSentinel;

  let slot: bigint;
  let epoch: bigint;
  let ts: bigint;
  let l1Constants: L1RollupConstants;

  beforeEach(async () => {
    epochCache = mock<EpochCache>();
    archiver = mock<L2BlockSource>();
    p2p = mock<P2PClient>();
    blockStream = mock<L2BlockStream>();

    kvStore = await openTmpStore('sentinel-test');
    store = new SentinelStore(kvStore, { historyLength: 4 });

    slot = 4n;
    epoch = 0n;
    ts = BigInt(Math.ceil(Date.now() / 1000));
    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: ts,
      slotDuration: 24,
      epochDuration: 32,
      ethereumSlotDuration: 12,
    };

    epochCache.getEpochAndSlotNow.mockReturnValue({ epoch, slot, ts });
    epochCache.getL1Constants.mockReturnValue(l1Constants);

    sentinel = new TestSentinel(epochCache, archiver, p2p, store, blockStream);
  });

  afterEach(async () => {
    await kvStore.close();
  });

  describe('getSlotActivity', () => {
    let signers: Secp256k1Signer[];
    let validators: EthAddress[];
    let block: PublishedL2Block;
    let attestations: BlockAttestation[];
    let proposer: EthAddress;
    let committee: EthAddress[];

    beforeEach(async () => {
      signers = times(4, Secp256k1Signer.random);
      validators = signers.map(signer => signer.address);
      block = await randomPublishedL2Block(Number(slot));
      attestations = await Promise.all(
        signers.map(signer => makeBlockAttestation({ signer, archive: block.block.archive.root })),
      );
      proposer = validators[0];
      committee = [...validators];

      p2p.getAttestationsForSlot.mockResolvedValue(attestations);
    });

    it('flags block as mined', async () => {
      await sentinel.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-mined');
    });

    it('flags block as proposed when it is not mined but there are attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue(attestations);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-proposed');
    });

    it('flags block as missed when there are no attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue([]);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-missed');
    });

    it('identifies missed attestors if block is mined', async () => {
      await sentinel.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      p2p.getAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('identifies missed attestors if block is proposed', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('does not tag attestors as missed if there was no block and no attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue([]);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-missed');
      expect(activity[committee[1].toString()]).not.toBeDefined();
      expect(activity[committee[2].toString()]).not.toBeDefined();
      expect(activity[committee[3].toString()]).not.toBeDefined();
    });
  });
});

class TestSentinel extends Sentinel {
  constructor(
    epochCache: EpochCache,
    archiver: L2BlockSource,
    p2p: P2PClient,
    store: SentinelStore,
    protected override blockStream: L2BlockStream,
  ) {
    super(epochCache, archiver, p2p, store);
  }

  public override init() {
    this.initialSlot = this.epochCache.getEpochAndSlotNow().slot;
    return Promise.resolve();
  }

  public override getSlotActivity(slot: bigint, epoch: bigint, proposer: EthAddress, committee: EthAddress[]) {
    return super.getSlotActivity(slot, epoch, proposer, committee);
  }
}
