import type { EpochAndSlot, EpochCache } from '@aztec/epoch-cache';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { Tx, TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPoolV2 } from '../../mem_pools/tx_pool_v2/interfaces.js';
import type { LibP2PService } from '../../services/libp2p/libp2p_service.js';
import type { ReqRespInterface } from '../../services/reqresp/interface.js';
import { ReqRespSubProtocol } from '../../services/reqresp/interface.js';
import { ReqRespStatus } from '../../services/reqresp/status.js';
import { makeAndStartTestP2PClients } from '../../test-helpers/make-test-p2p-clients.js';
import { MockGossipSubNetwork } from '../../test-helpers/mock-pubsub.js';
import { createMockTxWithMetadata } from '../../test-helpers/mock-tx-helpers.js';

const TEST_TIMEOUT = 120_000;
jest.setTimeout(TEST_TIMEOUT);

// Tests general reqresp flow using the MockReqResp class.
describe('p2p client integration reqresp', () => {
  let txPool: MockProxy<TxPoolV2>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  beforeEach(() => {
    clients = [];
    txPool = mock<TxPoolV2>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    logger = createLogger('p2p:test:integration-reqresp');
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) } as EpochAndSlot & {
      nowSeconds: bigint;
    });
    epochCache.getRegisteredValidators.mockResolvedValue([]);
    epochCache.getL1Constants.mockReturnValue({
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      slotDuration: 24,
      epochDuration: 16,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 2,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    });

    txPool.isEmpty.mockResolvedValue(true);
    txPool.hasTxs.mockResolvedValue([]);
    txPool.addPendingTxs.mockResolvedValue({ accepted: [], ignored: [], rejected: [] });
    txPool.getTxsByHash.mockImplementation(() => {
      return Promise.resolve([] as Tx[]);
    });

    attestationPool.isEmpty.mockResolvedValue(true);
    attestationPool.tryAddBlockProposal.mockResolvedValue({ added: true, alreadyExists: false, count: 1 });

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: BlockNumber.ZERO,
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber.ZERO,
        treesAreSynched: false,
        oldestHistoricBlockNumber: BlockNumber.ZERO,
      },
    });
    logger.info(`Starting test ${expect.getState().currentTestName}`);
  });

  afterEach(async () => {
    logger.info(`Tearing down state for ${expect.getState().currentTestName}`);
    await shutdown(clients);
    logger.info('Shut down p2p clients');

    jest.restoreAllMocks();
    jest.resetAllMocks();
    jest.clearAllMocks();

    clients = [];
  });

  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all(clients.map(client => client.stop()));
    await sleep(1000);
  };

  /** Extracts the reqresp interface from a P2PClient via the private p2pService. */
  const getReqResp = (client: P2PClient): ReqRespInterface => {
    const p2pService = (client as any).p2pService as LibP2PService;
    return (p2pService as any).reqresp as ReqRespInterface;
  };

  /** Extracts the peer ID from a P2PClient via the mock PubSub node. */
  const getPeerId = (client: P2PClient) => {
    const p2pService = (client as any).p2pService as LibP2PService;
    return (p2pService as any).node.peerId;
  };

  it('sendRequestToPeer routes to the correct peer handler', async () => {
    const numberOfNodes = 2;
    const mockGossipSubNetwork = new MockGossipSubNetwork();

    const testConfig = {
      p2pBaseConfig: { ...p2pBaseConfig, rollupVersion: 1 },
      mockAttestationPool: attestationPool,
      mockTxPool: txPool,
      mockEpochCache: epochCache,
      mockWorldState: worldState,
      alwaysTrueVerifier: true,
      mockGossipSubNetwork,
      logger,
    };

    const clientsAndConfig = await makeAndStartTestP2PClients(numberOfNodes, testConfig);
    clients = clientsAndConfig.map(c => c.client);

    await sleep(1000);

    // Create a mock tx and configure the shared pool to return it
    const tx = await createMockTxWithMetadata(testConfig.p2pBaseConfig);
    const txHash = tx.getTxHash();

    txPool.getTxByHash.mockImplementation((hash: TxHash) => Promise.resolve(hash.equals(txHash) ? tx : undefined));

    // Get node-1's peer ID and node-2's reqresp
    const node1PeerId = getPeerId(clients[0]);
    const reqresp = getReqResp(clients[1]);

    // Send a direct request to node-1
    const response = await reqresp.sendRequestToPeer(
      node1PeerId,
      ReqRespSubProtocol.TX,
      new TxHashArray(txHash).toBuffer(),
    );

    expect(response.status).toBe(ReqRespStatus.SUCCESS);
    if (response.status === ReqRespStatus.SUCCESS) {
      const txArray = TxArray.fromBuffer(response.data);
      expect(txArray).toHaveLength(1);

      const receivedTxHash = txArray[0].getTxHash();
      expect(receivedTxHash.toString()).toEqual(txHash.toString());
    }
  });
});
