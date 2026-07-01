import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { AppTaggingSecret, type LogResult, SiloedTag, Tag, computeSharedTaggingSecret } from '@aztec/stdlib/logs';
import { makeBlockHeader, makeL2Tips, randomPrivateLogResult } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  type LogRetrievalRequest,
  LogSource,
} from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { Option } from '../contract_function_simulator/noir-structs/option.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import { TaggingSecretSourcesStore } from '../storage/tagging_store/tagging_secret_sources_store.js';
import { LogService } from './log_service.js';

describe('LogService', () => {
  let contractAddress: AztecAddress;
  let aztecNode: MockProxy<AztecNode>;
  let keyStore: KeyStore;
  let addressStore: AddressStore;
  let taggingSecretSourcesStore: TaggingSecretSourcesStore;
  let logService: LogService;

  describe('fetchLogsByTag', () => {
    const tag = Tag.random();

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
      ({ aztecNode, keyStore, taggingSecretSourcesStore, addressStore, logService } = await createTestLogService());

      aztecNode.getPrivateLogsByTags.mockReset();
      aztecNode.getPublicLogsByTags.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns empty arrays if no logs are found', async () => {
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPublicLogsByTags.mockResolvedValue([[]]);
      const request = makeLogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);
      expect(responses).toEqual([[]]);
    });

    it('returns all logs when multiple public logs exist for a single tag', async () => {
      const scopedLog1 = randomPrivateLogResult({ includeEffects: true });
      const scopedLog2 = randomPrivateLogResult({ includeEffects: true });

      aztecNode.getPublicLogsByTags.mockResolvedValue([[scopedLog1, scopedLog2]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

      const request = makeLogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(scopedLog1.txHash);
      expect(responses[0][1].txHash).toEqual(scopedLog2.txHash);
    });

    it('returns all logs when multiple private logs exist for a single tag', async () => {
      const scopedLog1 = randomPrivateLogResult({ includeEffects: true });
      const scopedLog2 = randomPrivateLogResult({ includeEffects: true });

      aztecNode.getPublicLogsByTags.mockResolvedValue([[]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[scopedLog1, scopedLog2]]);

      const request = makeLogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(scopedLog1.txHash);
      expect(responses[0][1].txHash).toEqual(scopedLog2.txHash);
    });

    it('returns combined public and private logs for a single tag', async () => {
      const publicLog = randomPrivateLogResult({ includeEffects: true });
      const privateLog = randomPrivateLogResult({ includeEffects: true });

      aztecNode.getPublicLogsByTags.mockResolvedValue([[publicLog]]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog]]);

      const request = makeLogRetrievalRequest(contractAddress, tag);
      const responses = await logService.fetchLogsByTag(contractAddress, [request]);

      expect(responses[0]).toHaveLength(2);
      expect(responses[0][0].txHash).toEqual(publicLog.txHash);
      expect(responses[0][1].txHash).toEqual(privateLog.txHash);
    });

    it('rejects a batch where at least one request targets a different contract', async () => {
      const differentContract = await AztecAddress.random();
      const validRequest = makeLogRetrievalRequest(contractAddress, tag);
      const invalidRequest = makeLogRetrievalRequest(differentContract, Tag.random());

      await expect(logService.fetchLogsByTag(contractAddress, [validRequest, invalidRequest])).rejects.toThrow(
        /Got a log retrieval request from/,
      );
    });

    it('batches multiple requests into single RPC calls', async () => {
      const tag1 = Tag.random();
      const tag2 = Tag.random();
      const tag3 = Tag.random();

      const publicLog1 = randomPrivateLogResult({ includeEffects: true });
      const privateLog2 = randomPrivateLogResult({ includeEffects: true });

      aztecNode.getPublicLogsByTags.mockResolvedValue([[publicLog1], [], []]);
      aztecNode.getPrivateLogsByTags.mockResolvedValue([[], [privateLog2], []]);

      const requests = [
        makeLogRetrievalRequest(contractAddress, tag1),
        makeLogRetrievalRequest(contractAddress, tag2),
        makeLogRetrievalRequest(contractAddress, tag3),
      ];

      const responses = await logService.fetchLogsByTag(contractAddress, requests);

      expect(responses).toHaveLength(3);
      expect(responses[0]).toHaveLength(1);
      expect(responses[0][0].txHash).toEqual(publicLog1.txHash);
      expect(responses[1]).toHaveLength(1);
      expect(responses[1][0].txHash).toEqual(privateLog2.txHash);
      expect(responses[2]).toEqual([]);

      expect(aztecNode.getPublicLogsByTags).toHaveBeenCalledTimes(1);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    });

    it('returns empty array for empty requests', async () => {
      const responses = await logService.fetchLogsByTag(contractAddress, []);
      expect(responses).toEqual([]);
      expect(aztecNode.getPublicLogsByTags).not.toHaveBeenCalled();
      expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
    });

    describe('block range filtering', () => {
      // Range filtering happens in the node (Phase 2 pushed it down). These tests just verify the
      // service forwards `fromBlock`/`toBlock` and stitches whatever the node returns.
      it('forwards fromBlock to the node', async () => {
        const logAtBoundary = randomPrivateLogResult({ blockNumber: 10, includeEffects: true });

        aztecNode.getPublicLogsByTags.mockResolvedValue([[logAtBoundary]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = makeLogRetrievalRequest(
          contractAddress,
          tag,
          LogSource.PUBLIC_AND_PRIVATE,
          Option.some(BlockNumber(10)),
        );
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(aztecNode.getPublicLogsByTags).toHaveBeenCalledWith(
          expect.objectContaining({ fromBlock: BlockNumber(10) }),
        );
        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logAtBoundary.txHash);
      });

      it('forwards toBlock to the node', async () => {
        const logBeforeBoundary = randomPrivateLogResult({ blockNumber: 9, includeEffects: true });

        aztecNode.getPublicLogsByTags.mockResolvedValue([[logBeforeBoundary]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = makeLogRetrievalRequest(
          contractAddress,
          tag,
          LogSource.PUBLIC_AND_PRIVATE,
          undefined,
          Option.some(BlockNumber(10)),
        );
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(aztecNode.getPublicLogsByTags).toHaveBeenCalledWith(
          expect.objectContaining({ toBlock: BlockNumber(10) }),
        );
        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logBeforeBoundary.txHash);
      });

      it('forwards both fromBlock and toBlock to the node', async () => {
        const logInRange = randomPrivateLogResult({ blockNumber: 15, includeEffects: true });

        aztecNode.getPublicLogsByTags.mockResolvedValue([[logInRange]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[]]);

        const request = makeLogRetrievalRequest(
          contractAddress,
          tag,
          LogSource.PUBLIC_AND_PRIVATE,
          Option.some(BlockNumber(10)),
          Option.some(BlockNumber(20)),
        );
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(aztecNode.getPublicLogsByTags).toHaveBeenCalledWith(
          expect.objectContaining({ fromBlock: BlockNumber(10), toBlock: BlockNumber(20) }),
        );
        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(logInRange.txHash);
      });
    });

    describe('source filtering', () => {
      it('returns only public logs and skips private RPC when source is PUBLIC', async () => {
        const publicLog = randomPrivateLogResult({ includeEffects: true });

        aztecNode.getPublicLogsByTags.mockResolvedValue([[publicLog]]);

        const request = makeLogRetrievalRequest(contractAddress, tag, LogSource.PUBLIC);
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(publicLog.txHash);
        expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
      });

      it('returns only private logs and skips public RPC when source is PRIVATE', async () => {
        const privateLog = randomPrivateLogResult({ includeEffects: true });

        aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog]]);

        const request = makeLogRetrievalRequest(contractAddress, tag, LogSource.PRIVATE);
        const responses = await logService.fetchLogsByTag(contractAddress, [request]);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(privateLog.txHash);
        expect(aztecNode.getPublicLogsByTags).not.toHaveBeenCalled();
      });

      it('only sends relevant tags per source in a mixed batch', async () => {
        const tag1 = Tag.random();
        const tag2 = Tag.random();
        const tag3 = Tag.random();

        const publicLog1 = randomPrivateLogResult({ includeEffects: true });
        const privateLog2 = randomPrivateLogResult({ includeEffects: true });
        const publicLog3 = randomPrivateLogResult({ includeEffects: true });
        const privateLog3 = randomPrivateLogResult({ includeEffects: true });

        aztecNode.getPublicLogsByTags.mockResolvedValue([[publicLog1], [publicLog3]]);
        aztecNode.getPrivateLogsByTags.mockResolvedValue([[privateLog2], [privateLog3]]);

        const requests = [
          makeLogRetrievalRequest(contractAddress, tag1, LogSource.PUBLIC),
          makeLogRetrievalRequest(contractAddress, tag2, LogSource.PRIVATE),
          makeLogRetrievalRequest(contractAddress, tag3, LogSource.PUBLIC_AND_PRIVATE),
        ];

        const responses = await logService.fetchLogsByTag(contractAddress, requests);

        // Public RPC receives tag1 and tag3, private RPC receives tag2 and tag3
        expect(aztecNode.getPublicLogsByTags).toHaveBeenCalledTimes(1);
        const publicCallTags = aztecNode.getPublicLogsByTags.mock.calls[0][0].tags as Tag[];
        expect(publicCallTags).toHaveLength(2);
        expect(publicCallTags[0]).toEqual(tag1);
        expect(publicCallTags[1]).toEqual(tag3);

        expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
        const privateCallTags = aztecNode.getPrivateLogsByTags.mock.calls[0][0].tags as SiloedTag[];
        expect(privateCallTags).toHaveLength(2);
        const expectedSiloedTag2 = await SiloedTag.computeFromTagAndApp(tag2, contractAddress);
        const expectedSiloedTag3 = await SiloedTag.computeFromTagAndApp(tag3, contractAddress);
        expect(privateCallTags[0]).toEqual(expectedSiloedTag2);
        expect(privateCallTags[1]).toEqual(expectedSiloedTag3);

        expect(responses[0]).toHaveLength(1);
        expect(responses[0][0].txHash).toEqual(publicLog1.txHash);
        expect(responses[1]).toHaveLength(1);
        expect(responses[1][0].txHash).toEqual(privateLog2.txHash);
        expect(responses[2]).toHaveLength(2);
        expect(responses[2][0].txHash).toEqual(publicLog3.txHash);
        expect(responses[2][1].txHash).toEqual(privateLog3.txHash);
      });
    });
  });

  // Address-derived discovery is gated on registering the sender: the recipient can only reconstruct a sender's tags
  // for senders in `getSenders()` (plus its own accounts). This pins that gate through `fetchTaggedLogs` end to end.
  describe('address-derived sender gate', () => {
    let recipientCompleteAddress: CompleteAddress;
    let recipient: AztecAddress;
    let sender: AztecAddress;
    let senderIndex0Tag: SiloedTag;
    let senderLog: LogResult;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();

      const l2TipsProvider = mock<L2TipsProvider>();
      const testContext = await createTestLogService(l2TipsProvider);
      ({ aztecNode, keyStore, taggingSecretSourcesStore, addressStore, logService } = testContext);
      l2TipsProvider.getL2Tips.mockResolvedValue(makeL2Tips(testContext.anchorBlockHeader.globalVariables.blockNumber));

      // A real recipient account, so the ECDH tag derivation has the keys and address preimage it needs.
      recipientCompleteAddress = await keyStore.addAccount(new Fr(1), Fr.random());
      recipient = recipientCompleteAddress.address;
      await addressStore.addCompleteAddress(recipientCompleteAddress);

      sender = await AztecAddress.random();

      // Recompute, from the same ECDH inputs the service uses, the tag the recipient would scan for the sender's
      // first message. The node returns the sender's log only for this exact tag, so discovery proves the tag was
      // scanned, which only happens when the sender is registered.
      const recipientIvsk = await keyStore.getMasterIncomingViewingSecretKey(recipient);
      const sharedSecret = await computeSharedTaggingSecret(recipientCompleteAddress, recipientIvsk, sender);
      const appSecret = await AppTaggingSecret.computeDirectional(sharedSecret!, contractAddress, recipient);
      senderIndex0Tag = await SiloedTag.compute({ extendedSecret: appSecret, index: 0 });

      // Past the anchor block, so the log is unfinalized and the scan completes in a single round.
      senderLog = randomPrivateLogResult({ blockNumber: INITIAL_L2_BLOCK_NUM + 1, includeEffects: true });
      aztecNode.getPrivateLogsByTags.mockImplementation(({ tags }) =>
        Promise.resolve(
          // A tag query is either a bare tag (first page) or a `{ tag, afterLog }` cursor (paginated follow-ups).
          tags.map(query => {
            const siloedTag = query instanceof SiloedTag ? query : query.tag;
            return siloedTag.equals(senderIndex0Tag) ? [senderLog] : [];
          }),
        ),
      );
    });

    it('does not discover messages from an unregistered sender', async () => {
      const discovered = await logService.fetchTaggedLogs(contractAddress, recipient, []);
      expect(discovered).toEqual([]);
    });

    it('discovers the sender messages once the sender is registered', async () => {
      await taggingSecretSourcesStore.addSender(sender);

      const discovered = await logService.fetchTaggedLogs(contractAddress, recipient, []);

      expect(discovered).toHaveLength(1);
      expect(discovered[0].context.txHash).toEqual(senderLog.txHash);
    });
  });
});

async function createTestLogService(l2TipsProvider: MockProxy<L2TipsProvider> = mock<L2TipsProvider>()) {
  const keyStore = new KeyStore(await openTmpStore('test'));
  const recipientTaggingStore = new RecipientTaggingStore(await openTmpStore('test'));
  const taggingSecretSourcesStore = new TaggingSecretSourcesStore(await openTmpStore('test'));
  const addressStore = new AddressStore(await openTmpStore('test'));
  const aztecNode = mock<AztecNode>();
  // Anchor block header is required for bulkRetrieveLogs.
  const anchorBlockHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

  const logService = new LogService(
    aztecNode,
    anchorBlockHeader,
    l2TipsProvider,
    keyStore,
    recipientTaggingStore,
    taggingSecretSourcesStore,
    addressStore,
    'test',
  );

  return {
    aztecNode,
    keyStore,
    recipientTaggingStore,
    taggingSecretSourcesStore,
    addressStore,
    anchorBlockHeader,
    logService,
  };
}

function makeLogRetrievalRequest(
  contractAddress: AztecAddress,
  tag: Tag,
  source: LogSource = LogSource.PUBLIC_AND_PRIVATE,
  fromBlock: Option<BlockNumber> = Option.none(),
  toBlock: Option<BlockNumber> = Option.none(),
): LogRetrievalRequest {
  return { contractAddress, tag, source, fromBlock, toBlock };
}
