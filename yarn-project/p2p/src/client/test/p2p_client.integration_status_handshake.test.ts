import type { EpochCache } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';

import { describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../../mem_pools/tx_pool/index.js';
import { ReqRespSubProtocol } from '../../services/reqresp/interface.js';
import { ReqRespStatus } from '../../services/reqresp/status.js';
import { makeTestP2PClients, startTestP2PClients } from '../../test-helpers/make-test-p2p-clients.js';

const TEST_TIMEOUT = 120000;
jest.setTimeout(TEST_TIMEOUT);

const NUMBER_OF_PEERS = 2;

describe('p2p client integration status handshake', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;

  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];

  beforeEach(() => {
    clients = [];
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();

    logger = createLogger('p2p:test:integration');
    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    //@ts-expect-error - we want to mock the getEpochAndSlotInNextL1Slot method, mocking ts is enough
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    epochCache.getRegisteredValidators.mockResolvedValue([]);

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: 0,
        latestBlockHash: '',
        finalizedBlockNumber: 0,
        treesAreSynched: false,
        oldestHistoricBlockNumber: 0,
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

  // Shutdown all test clients
  const shutdown = async (clients: P2PClient[]) => {
    await Promise.all(clients.map(client => client.stop()));
    await sleep(1000);
  };

  it('should not disconnect clients when it returns correct status', async () => {
    clients = (
      await makeTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);

    const [client1] = clients;
    const disconnectSpies = clients.map(c => jest.spyOn((c as any).p2pService.peerManager, 'markPeerForDisconnect'));
    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );

    await startTestP2PClients(clients);
    await retryUntil(async () => (await client1.getPeers()).length == 1, 'peers discovered', 10, 0.5);
    logger.info(`Finished waiting for clients to connect`);

    for (const handshakeSpy of statusHandshakeSpies) {
      expect(handshakeSpy).toHaveBeenCalled();
    }

    for (const disconnectSpy of disconnectSpies) {
      expect(disconnectSpy).not.toHaveBeenCalled();
    }
  });

  it('should disconnect client when it returns status with wrong version', async () => {
    clients = (
      await makeTestP2PClients(NUMBER_OF_PEERS, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);
    const [client1] = clients;
    (client1 as any).p2pService.peerManager.protocolVersion = 'WRONG_VERSION';

    const disconnectSpy = jest.spyOn((client1 as any).p2pService.peerManager, 'markPeerForDisconnect');
    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );

    await startTestP2PClients(clients);
    await retryUntil(async () => (await client1.getPeers()).length == 1, 'peers discovered', 10, 0.5);
    logger.info(`Finished waiting for clients to connect`);

    for (const handshakeSpy of statusHandshakeSpies) {
      expect(handshakeSpy).toHaveBeenCalled();
    }

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('should disconnect client when it returns an invalid status', async () => {
    const peerTestCount = 3;
    clients = (
      await makeTestP2PClients(peerTestCount, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPool,
        mockEpochCache: epochCache,
        mockWorldState: worldState,
      })
    ).map(x => x.client);
    const [_c0, c1, _c2] = clients;
    logger.info(`Created p2p clients`);

    const statusHandshakeSpies = clients.map(c =>
      jest.spyOn((c as any).p2pService.peerManager, 'exchangeStatusHandshake'),
    );
    const disconnectSpies = clients.map(c => jest.spyOn((c as any).p2pService.peerManager, 'markPeerForDisconnect'));

    const badPeerId = (clients[0] as any).p2pService.node.peerId;
    const c1PeerManager = (c1 as any).p2pService.peerManager;
    const realSend = c1PeerManager.reqresp.sendRequestToPeer;

    // @ts-expect-error arguments not expected
    jest.spyOn(c1PeerManager.reqresp, 'sendRequestToPeer').mockImplementation(async function (
      peerId: PeerId,
      protocol: ReqRespSubProtocol,
      ...rest
    ) {
      if (peerId.toString() === badPeerId.toString() && protocol === ReqRespSubProtocol.STATUS) {
        return Promise.resolve({ status: ReqRespStatus.SUCCESS, data: Buffer.from('invalid status') });
      }

      return await realSend.apply(c1PeerManager.reqresp, [peerId, protocol, ...rest]);
    });

    await startTestP2PClients(clients);
    logger.info(`Started p2p clients`, { enrs: clients.map(c => c.getEnr()?.encodeTxt) });
    await retryUntil(async () => (await c1.getPeers()).length >= 1, 'peers discovered', 10, 0.5);
    logger.info(`Finished waiting for clients to connect`);

    expect(disconnectSpies[1]).toHaveBeenCalled(); // c1 <> C0 disconnected
    expect(disconnectSpies[2]).not.toHaveBeenCalled(); // c2 is ok with both c0 and c1

    const expectedHandshakeCount = peerTestCount - 1;
    // c2 established connection exactly once with both c0 and c1
    expect(statusHandshakeSpies[2]).toHaveBeenCalledTimes(expectedHandshakeCount);

    // c1 received invalid status from c0 exactly once
    // the connection between c0 and c1 might have been retried in the meantime
    // I say "might" because the test is flaky especially on CI
    // This is why we use `toBeGreaterThanOrEqual` instead of `toHaveBeenCalledTimes`
    expect(statusHandshakeSpies[0].mock.calls.length).toBeGreaterThanOrEqual(expectedHandshakeCount);
    expect(statusHandshakeSpies[1].mock.calls.length).toBeGreaterThanOrEqual(expectedHandshakeCount);
  });
});
