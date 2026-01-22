import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type BlockProposal, type CheckpointProposal, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import type { TxHash } from '@aztec/stdlib/tx';

import type { MockProxy } from 'jest-mock-extended';

export interface ProposalValidatorTestParams<TProposal extends BlockProposal | CheckpointProposal> {
  validatorFactory: (
    epochCache: EpochCacheInterface,
    opts: { txsPermitted: boolean },
  ) => { validate: (proposal: TProposal) => Promise<PeerErrorSeverity | undefined> };
  makeProposal: (options?: any) => Promise<TProposal>;
  makeHeader: (epochNumber: number | bigint, slotNumber: number | bigint, blockNumber: number | bigint) => any;
  getSigner: () => Secp256k1Signer;
  getAddress: (signer?: Secp256k1Signer) => EthAddress;
  getSlot: (slot: number | bigint) => any;
  getTxHashes: (n: number) => TxHash[];
  getTxs: () => any[];
  epochCacheMock: () => MockProxy<EpochCacheInterface>;
}

export function sharedProposalValidatorTests<TProposal extends BlockProposal | CheckpointProposal>(
  params: ProposalValidatorTestParams<TProposal>,
) {
  const { validatorFactory, makeProposal, makeHeader, getSigner, getAddress, getSlot, getTxHashes, epochCacheMock } =
    params;

  describe('shared proposal validation logic', () => {
    let epochCache: MockProxy<EpochCacheInterface>;
    let validator: { validate: (proposal: TProposal) => Promise<PeerErrorSeverity | undefined> };
    const currentSlot = getSlot(100);
    const nextSlot = getSlot(101);

    function mockGetProposer(currentProposer: EthAddress, nextProposer: EthAddress) {
      epochCache.getProposerAttesterAddressInSlot.mockImplementation(slot => {
        if (slot === currentSlot) {
          return Promise.resolve(currentProposer);
        }
        if (slot === nextSlot) {
          return Promise.resolve(nextProposer);
        }
        throw new Error('Unexpected argument');
      });
    }

    beforeEach(() => {
      epochCache = epochCacheMock();
      validator = validatorFactory(epochCache, { txsPermitted: true });
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: currentSlot,
        nextSlot: nextSlot,
      });
    });

    it('returns high tolerance error if slot number is not current or next slot', async () => {
      const header = makeHeader(1, 99, 99);
      const mockProposal = await makeProposal({ blockHeader: header, lastBlockHeader: header });

      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(getAddress());
      const result = await validator.validate(mockProposal);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not try to resolve proposers if base validation fails
      expect(epochCache.getProposerAttesterAddressInSlot).not.toHaveBeenCalled();
    });

    it('returns mid tolerance error if proposer is not current proposer for current slot', async () => {
      const currentProposer = getSigner();
      const nextProposer = getSigner();
      const invalidProposer = getSigner();
      const header = makeHeader(1, 100, 100);
      const mockProposal = await makeProposal({
        blockHeader: header,
        lastBlockHeader: header,
        signer: invalidProposer,
      });

      mockGetProposer(getAddress(currentProposer), getAddress(nextProposer));
      const result = await validator.validate(mockProposal);
      expect(result).toBe(PeerErrorSeverity.MidToleranceError);
    });

    it('returns mid tolerance error if proposer is not next proposer for next slot', async () => {
      const currentProposer = getSigner();
      const nextProposer = getSigner();
      const invalidProposer = getSigner();
      const header = makeHeader(1, 101, 101);
      const mockProposal = await makeProposal({
        blockHeader: header,
        lastBlockHeader: header,
        signer: invalidProposer,
      });

      mockGetProposer(getAddress(currentProposer), getAddress(nextProposer));
      const result = await validator.validate(mockProposal);
      expect(result).toBe(PeerErrorSeverity.MidToleranceError);
    });

    it('returns mid tolerance error if proposer is current proposer but proposal is for next slot', async () => {
      const currentProposer = getSigner();
      const nextProposer = getSigner();
      const header = makeHeader(1, 101, 101);
      const mockProposal = await makeProposal({
        blockHeader: header,
        lastBlockHeader: header,
        signer: currentProposer,
      });

      mockGetProposer(getAddress(currentProposer), getAddress(nextProposer));
      const result = await validator.validate(mockProposal);
      expect(result).toBe(PeerErrorSeverity.MidToleranceError);
    });

    it('returns undefined if proposal is valid for current slot and proposer', async () => {
      const currentProposer = getSigner();
      const nextProposer = getSigner();
      const header = makeHeader(1, 100, 100);
      const mockProposal = await makeProposal({
        blockHeader: header,
        lastBlockHeader: header,
        signer: currentProposer,
      });

      mockGetProposer(getAddress(currentProposer), getAddress(nextProposer));
      const result = await validator.validate(mockProposal);
      expect(result).toBeUndefined();
    });

    it('returns undefined if proposal is valid for next slot and proposer', async () => {
      const currentProposer = getSigner();
      const nextProposer = getSigner();
      const header = makeHeader(1, 101, 101);
      const mockProposal = await makeProposal({ blockHeader: header, lastBlockHeader: header, signer: nextProposer });

      mockGetProposer(getAddress(currentProposer), getAddress(nextProposer));
      const result = await validator.validate(mockProposal);
      expect(result).toBeUndefined();
    });

    describe('transaction permission validation', () => {
      it('returns mid tolerance error if txs not permitted and proposal contains txHashes', async () => {
        const currentProposer = getSigner();
        const validatorWithTxsDisabled = validatorFactory(epochCache, { txsPermitted: false });
        const header = makeHeader(1, 100, 100);
        const mockProposal = await makeProposal({
          blockHeader: header,
          lastBlockHeader: header,
          signer: currentProposer,
          txHashes: getTxHashes(2),
        });

        mockGetProposer(getAddress(currentProposer), getAddress());
        const result = await validatorWithTxsDisabled.validate(mockProposal);
        expect(result).toBe(PeerErrorSeverity.MidToleranceError);
      });

      it('returns undefined if txs not permitted but proposal has no txHashes', async () => {
        const currentProposer = getSigner();
        const validatorWithTxsDisabled = validatorFactory(epochCache, { txsPermitted: false });
        const header = makeHeader(1, 100, 100);
        const mockProposal = await makeProposal({
          blockHeader: header,
          lastBlockHeader: header,
          signer: currentProposer,
          txHashes: getTxHashes(0),
        });

        mockGetProposer(getAddress(currentProposer), getAddress());
        const result = await validatorWithTxsDisabled.validate(mockProposal);
        expect(result).toBeUndefined();
      });

      it('returns undefined if txs permitted and proposal contains txHashes', async () => {
        const currentProposer = getSigner();
        const header = makeHeader(1, 100, 100);
        const mockProposal = await makeProposal({
          blockHeader: header,
          lastBlockHeader: header,
          signer: currentProposer,
          txHashes: getTxHashes(2),
        });

        mockGetProposer(getAddress(currentProposer), getAddress());
        const result = await validator.validate(mockProposal);
        expect(result).toBeUndefined();
      });
    });
  });
}
