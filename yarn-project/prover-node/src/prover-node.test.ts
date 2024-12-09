import {
  type EpochProofClaim,
  EpochProofQuote,
  EpochProofQuotePayload,
  type EpochProverManager,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type MerkleTreeWriteOperations,
  type ProverCache,
  type ProverCoordination,
  WorldStateRunningState,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { type ContractDataSource, EthAddress, Fr } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import {
  type BootstrapNode,
  InMemoryAttestationPool,
  InMemoryTxPool,
  MemoryEpochProofQuotePool,
  P2PClient,
} from '@aztec/p2p';
import { createBootstrapNode, createTestLibP2PService } from '@aztec/p2p/mocks';
import { type L1Publisher } from '@aztec/sequencer-client';
import { type PublicProcessorFactory } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type BondManager } from './bond/bond-manager.js';
import { type EpochProvingJob } from './job/epoch-proving-job.js';
import { ClaimsMonitor } from './monitors/claims-monitor.js';
import { EpochMonitor } from './monitors/epoch-monitor.js';
import { ProverCacheManager } from './prover-cache/cache_manager.js';
import { ProverNode, type ProverNodeOptions } from './prover-node.js';
import { type QuoteProvider } from './quote-provider/index.js';
import { type QuoteSigner } from './quote-signer.js';

describe('prover-node', () => {
  // Prover node dependencies
  let prover: MockProxy<EpochProverManager>;
  let publisher: MockProxy<L1Publisher>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let coordination: MockProxy<ProverCoordination> | ProverCoordination;
  let quoteProvider: MockProxy<QuoteProvider>;
  let quoteSigner: MockProxy<QuoteSigner>;
  let bondManager: MockProxy<BondManager>;
  let telemetryClient: NoopTelemetryClient;
  let config: ProverNodeOptions;

  // Subject under test
  let proverNode: TestProverNode;

  // Quote returned by the provider by default and its completed quote
  let partialQuote: Pick<EpochProofQuotePayload, 'basisPointFee' | 'bondAmount' | 'validUntilSlot'>;

  // Sample claim
  let claim: MockProxy<EpochProofClaim>;

  // Blocks returned by the archiver
  let blocks: MockProxy<L2Block>[];

  // Address of the publisher
  let address: EthAddress;

  // List of all jobs ever created by the test prover node and their dependencies
  let jobs: {
    job: MockProxy<EpochProvingJob>;
    cleanUp: (job: EpochProvingJob) => Promise<void>;
    epochNumber: bigint;
  }[];

  const toQuotePayload = (
    epoch: bigint,
    partialQuote: Pick<EpochProofQuotePayload, 'basisPointFee' | 'bondAmount' | 'validUntilSlot'>,
  ) => EpochProofQuotePayload.from({ ...partialQuote, prover: address, epochToProve: epoch });

  const toExpectedQuote = (
    epoch: bigint,
    quote: Pick<EpochProofQuotePayload, 'basisPointFee' | 'bondAmount' | 'validUntilSlot'> = partialQuote,
  ) => expect.objectContaining({ payload: toQuotePayload(epoch, quote) });

  const createProverNode = (claimsMonitor: ClaimsMonitor, epochMonitor: EpochMonitor) =>
    new TestProverNode(
      prover,
      publisher,
      l2BlockSource,
      l1ToL2MessageSource,
      contractDataSource,
      worldState,
      coordination,
      quoteProvider,
      quoteSigner,
      claimsMonitor,
      epochMonitor,
      bondManager,
      telemetryClient,
      new ProverCacheManager(),
      config,
    );

  beforeEach(() => {
    prover = mock<EpochProverManager>();
    publisher = mock<L1Publisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
    coordination = mock<ProverCoordination>();
    quoteProvider = mock<QuoteProvider>();
    quoteSigner = mock<QuoteSigner>();
    bondManager = mock<BondManager>();

    telemetryClient = new NoopTelemetryClient();
    config = { maxPendingJobs: 3, pollingIntervalMs: 10, maxParallelBlocksPerEpoch: 32 };

    // World state returns a new mock db every time it is asked to fork
    worldState.fork.mockImplementation(() => Promise.resolve(mock<MerkleTreeWriteOperations>()));
    worldState.status.mockResolvedValue({
      syncedToL2Block: { number: 1, hash: '' },
      state: WorldStateRunningState.RUNNING,
    });

    // Publisher returns its sender address
    address = EthAddress.random();
    publisher.getSenderAddress.mockReturnValue(address);

    // Quote provider returns a mock
    partialQuote = { basisPointFee: 100, bondAmount: 0n, validUntilSlot: 30n };
    quoteProvider.getQuote.mockResolvedValue(partialQuote);

    // Signer returns an empty signature
    quoteSigner.sign.mockImplementation(payload => Promise.resolve(new EpochProofQuote(payload, Signature.empty())));

    // Archiver returns a bunch of fake blocks
    blocks = times(3, i => mock<L2Block>({ number: i + 20, hash: () => new Fr(i) }));
    l2BlockSource.getBlocksForEpoch.mockResolvedValue(blocks);

    // A sample claim
    claim = { epochToProve: 10n, bondProvider: address } as EpochProofClaim;

    jobs = [];
  });

  afterEach(async () => {
    await proverNode.stop();
  });

  describe('with mocked monitors', () => {
    let claimsMonitor: MockProxy<ClaimsMonitor>;
    let epochMonitor: MockProxy<EpochMonitor>;

    beforeEach(() => {
      claimsMonitor = mock<ClaimsMonitor>();
      epochMonitor = mock<EpochMonitor>();

      proverNode = createProverNode(claimsMonitor, epochMonitor);
    });

    it('sends a quote on a finished epoch', async () => {
      await proverNode.handleEpochCompleted(10n);

      expect(quoteProvider.getQuote).toHaveBeenCalledWith(10, blocks);
      expect(quoteSigner.sign).toHaveBeenCalledWith(expect.objectContaining(partialQuote));
      expect(coordination.addEpochProofQuote).toHaveBeenCalledTimes(1);

      expect(coordination.addEpochProofQuote).toHaveBeenCalledWith(toExpectedQuote(10n));
    });

    it('does not send a quote on a finished epoch if the provider does not return one', async () => {
      quoteProvider.getQuote.mockResolvedValue(undefined);
      await proverNode.handleEpochCompleted(10n);

      expect(quoteSigner.sign).not.toHaveBeenCalled();
      expect(coordination.addEpochProofQuote).not.toHaveBeenCalled();
    });

    it('starts proving on a new claim', async () => {
      await proverNode.handleClaim(claim);

      expect(jobs[0].epochNumber).toEqual(10n);
    });

    it('does not prove the same epoch twice', async () => {
      await proverNode.handleClaim(claim);
      await proverNode.handleClaim(claim);

      expect(jobs.length).toEqual(1);
    });

    it('sends a quote on the initial sync if there is no claim', async () => {
      await proverNode.handleInitialEpochSync(10n);

      expect(coordination.addEpochProofQuote).toHaveBeenCalledTimes(1);
    });

    it('sends a quote on the initial sync if there is a claim for an older epoch', async () => {
      const claim = { epochToProve: 9n, bondProvider: EthAddress.random() } as EpochProofClaim;
      publisher.getProofClaim.mockResolvedValue(claim);
      await proverNode.handleInitialEpochSync(10n);

      expect(coordination.addEpochProofQuote).toHaveBeenCalledTimes(1);
    });

    it('does not send a quote on the initial sync if there is already a claim', async () => {
      const claim = { epochToProve: 10n, bondProvider: EthAddress.random() } as EpochProofClaim;
      publisher.getProofClaim.mockResolvedValue(claim);
      await proverNode.handleInitialEpochSync(10n);

      expect(coordination.addEpochProofQuote).not.toHaveBeenCalled();
    });

    it('starts proving if there is a claim sent by us', async () => {
      publisher.getProofClaim.mockResolvedValue(claim);
      l2BlockSource.getProvenL2EpochNumber.mockResolvedValue(9);
      await proverNode.handleInitialEpochSync(10n);

      expect(jobs[0].epochNumber).toEqual(10n);
    });

    it('does not start proving if there is a claim sent by us but proof has already landed', async () => {
      publisher.getProofClaim.mockResolvedValue(claim);
      l2BlockSource.getProvenL2EpochNumber.mockResolvedValue(10);
      await proverNode.handleInitialEpochSync(10n);

      expect(jobs.length).toEqual(0);
    });
  });

  describe('with actual monitors', () => {
    let claimsMonitor: ClaimsMonitor;
    let epochMonitor: EpochMonitor;

    // Answers l2BlockSource.isEpochComplete, queried from the epoch monitor
    let lastEpochComplete: bigint = 0n;

    beforeEach(() => {
      claimsMonitor = new ClaimsMonitor(publisher, config);
      epochMonitor = new EpochMonitor(l2BlockSource, config);

      l2BlockSource.isEpochComplete.mockImplementation(epochNumber =>
        Promise.resolve(epochNumber <= lastEpochComplete),
      );

      proverNode = createProverNode(claimsMonitor, epochMonitor);
    });

    it('sends a quote on initial sync', async () => {
      l2BlockSource.getL2EpochNumber.mockResolvedValue(10n);

      await proverNode.start();
      await sleep(100);
      expect(coordination.addEpochProofQuote).toHaveBeenCalledTimes(1);
    });

    it('sends another quote when a new epoch is completed', async () => {
      lastEpochComplete = 10n;
      l2BlockSource.getL2EpochNumber.mockResolvedValue(11n);

      await proverNode.start();
      await sleep(100);

      lastEpochComplete = 11n;
      await sleep(100);

      expect(coordination.addEpochProofQuote).toHaveBeenCalledTimes(2);
      expect(coordination.addEpochProofQuote).toHaveBeenCalledWith(toExpectedQuote(10n));
      expect(coordination.addEpochProofQuote).toHaveBeenCalledWith(toExpectedQuote(11n));
    });

    it('starts proving when a claim is seen', async () => {
      publisher.getProofClaim.mockResolvedValue(claim);

      await proverNode.start();
      await sleep(100);

      expect(jobs[0].epochNumber).toEqual(10n);
    });
  });

  // Things to test
  // - Another aztec node receives the proof quote via p2p
  // - The prover node can get the  it is missing via p2p, or it has them in it's mempool
  describe('Using a p2p coordination', () => {
    let bootnode: BootstrapNode;
    let p2pClient: P2PClient;
    let otherP2PClient: P2PClient;

    const createP2PClient = async (bootnodeAddr: string, port: number) => {
      const mempools = {
        txPool: new InMemoryTxPool(telemetryClient),
        attestationPool: new InMemoryAttestationPool(telemetryClient),
        epochProofQuotePool: new MemoryEpochProofQuotePool(telemetryClient),
      };
      const libp2pService = await createTestLibP2PService(
        [bootnodeAddr],
        l2BlockSource,
        worldState,
        mempools,
        telemetryClient,
        port,
      );
      const kvStore = openTmpStore();
      return new P2PClient(kvStore, l2BlockSource, mempools, libp2pService, 0);
    };

    beforeEach(async () => {
      bootnode = await createBootstrapNode(40400);
      await sleep(1000);

      const bootnodeAddr = bootnode.getENR().encodeTxt();
      p2pClient = await createP2PClient(bootnodeAddr, 8080);
      otherP2PClient = await createP2PClient(bootnodeAddr, 8081);

      // Set the p2p client to be the coordination method
      coordination = p2pClient;

      await Promise.all([p2pClient.start(), otherP2PClient.start()]);

      // Sleep to enable peer discovery
      await sleep(3000);
    }, 10000);

    afterEach(async () => {
      await bootnode.stop();
      await p2pClient?.stop();
      await otherP2PClient.stop();
    });

    describe('with mocked monitors', () => {
      let claimsMonitor: MockProxy<ClaimsMonitor>;
      let epochMonitor: MockProxy<EpochMonitor>;

      beforeEach(() => {
        claimsMonitor = mock<ClaimsMonitor>();
        epochMonitor = mock<EpochMonitor>();

        proverNode = createProverNode(claimsMonitor, epochMonitor);
      });

      afterEach(async () => {
        await proverNode.stop();
      });

      it('Should send a proof quote via p2p to another node', async () => {
        // Check that the p2p client receives the quote (casted as any to access private property)
        const p2pEpochReceivedSpy = jest.spyOn((otherP2PClient as any).p2pService, 'processEpochProofQuoteFromPeer');

        // Check the other node's pool has no quotes yet
        const peerInitialState = await otherP2PClient.getEpochProofQuotes(10n);
        expect(peerInitialState.length).toEqual(0);

        await proverNode.handleEpochCompleted(10n);

        // Wait for message to be propagated
        await sleep(1000);

        // Check the other node received a quote via p2p
        expect(p2pEpochReceivedSpy).toHaveBeenCalledTimes(1);

        // We should be able to retreive the quote from the other node
        const peerFinalStateQuotes = await otherP2PClient.getEpochProofQuotes(10n);
        expect(peerFinalStateQuotes[0]).toEqual(toExpectedQuote(10n));
      });
    });
  });

  class TestProverNode extends ProverNode {
    protected override doCreateEpochProvingJob(
      epochNumber: bigint,
      _blocks: L2Block[],
      _cache: ProverCache,
      _publicProcessorFactory: PublicProcessorFactory,
      cleanUp: (job: EpochProvingJob) => Promise<void>,
    ): EpochProvingJob {
      const job = mock<EpochProvingJob>({ getState: () => 'processing', run: () => Promise.resolve() });
      job.getId.mockReturnValue(jobs.length.toString());
      jobs.push({ epochNumber, job, cleanUp });
      return job;
    }

    public override triggerMonitors() {
      return super.triggerMonitors();
    }
  }
});
