import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { GovernanceProposerContract, PublisherManager, RollupContract } from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { DateProvider } from '@aztec/foundation/timer';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NodeKeystoreAdapter } from '@aztec/validator-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { SequencerClientConfig } from '../config.js';
import { SequencerPublisherFactory } from './sequencer-publisher-factory.js';

describe('SequencerPublisherFactory', () => {
  let factory: SequencerPublisherFactory;
  let mockConfig: SequencerClientConfig;
  let mockPublisherManager: MockProxy<PublisherManager<L1TxUtilsWithBlobs>>;
  let mockBlobSinkClient: MockProxy<BlobSinkClientInterface>;
  let mockDateProvider: MockProxy<DateProvider>;
  let mockEpochCache: MockProxy<EpochCache>;
  let mockRollupContract: MockProxy<RollupContract>;
  let mockGovernanceProposerContract: MockProxy<GovernanceProposerContract>;
  let mockSlashFactoryContract: MockProxy<SlashFactoryContract>;
  let mockNodeKeyStore: MockProxy<NodeKeystoreAdapter>;
  let mockL1TxUtils: MockProxy<L1TxUtilsWithBlobs>;

  const validatorAddress = EthAddress.random();
  const publisherAddress = EthAddress.random();
  const attestorAddress = EthAddress.random();

  beforeEach(() => {
    mockConfig = {
      ethereumSlotDuration: 12,
    } as SequencerClientConfig;
    mockPublisherManager = mock<PublisherManager<L1TxUtilsWithBlobs>>();
    mockBlobSinkClient = mock<BlobSinkClientInterface>();
    mockDateProvider = mock<DateProvider>();
    mockEpochCache = mock<EpochCache>();
    mockNodeKeyStore = mock<NodeKeystoreAdapter>();
    mockL1TxUtils = mock<L1TxUtilsWithBlobs>();
    mockRollupContract = mock<RollupContract>();
    mockGovernanceProposerContract = mock<GovernanceProposerContract>();
    mockSlashFactoryContract = mock<SlashFactoryContract>();

    mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);
    mockPublisherManager.getAvailablePublisher.mockResolvedValue(mockL1TxUtils);
    mockRollupContract.getSlashingProposer.mockResolvedValue({} as any);

    factory = new SequencerPublisherFactory(mockConfig, {
      telemetry: getTelemetryClient(),
      publisherManager: mockPublisherManager,
      blobSinkClient: mockBlobSinkClient,
      dateProvider: mockDateProvider,
      epochCache: mockEpochCache,
      governanceProposerContract: mockGovernanceProposerContract,
      rollupContract: mockRollupContract,
      slashFactoryContract: mockSlashFactoryContract,
      nodeKeyStore: mockNodeKeyStore,
    });
  });

  describe('create', () => {
    it('should create publisher without validator address (no filter)', async () => {
      mockNodeKeyStore.getAttestorForPublisher.mockReturnValue(attestorAddress);

      const result = await factory.create();

      expect(mockPublisherManager.getAvailablePublisher).toHaveBeenCalledWith(expect.any(Function));

      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(true);

      expect(mockNodeKeyStore.getAttestorForPublisher).toHaveBeenCalledWith(publisherAddress);
      expect(mockRollupContract.getSlashingProposer).toHaveBeenCalled();

      expect(result.attestorAddress).toBe(attestorAddress);
      expect(result.publisher).toBeDefined();
    });

    it('should create publisher with validator address and allowed publishers', async () => {
      const allowedPublishers = [publisherAddress, EthAddress.random()];
      mockNodeKeyStore.getPublisherAddresses.mockReturnValue(allowedPublishers);

      const result = await factory.create(validatorAddress);

      expect(mockNodeKeyStore.getPublisherAddresses).toHaveBeenCalledWith(validatorAddress);
      expect(mockPublisherManager.getAvailablePublisher).toHaveBeenCalledWith(expect.any(Function));

      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(true);

      expect(mockRollupContract.getSlashingProposer).toHaveBeenCalled();

      expect(result.attestorAddress).toBe(validatorAddress);
      expect(result.publisher).toBeDefined();
    });

    it('should throw if no allowed publishers are available', async () => {
      const otherPublisherAddress = EthAddress.random();
      const allowedPublishers = [otherPublisherAddress];

      mockNodeKeyStore.getPublisherAddresses.mockReturnValue(allowedPublishers);
      mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);
      mockPublisherManager.getAvailablePublisher.mockRejectedValueOnce(
        new Error(`Failed to find an available publisher.`),
      );

      await expect(factory.create(validatorAddress)).rejects.toThrow('Failed to find an available publisher.');

      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(false);
    });

    it('should allow publishers that are in the allowed list for validator', async () => {
      const allowedPublishers = [publisherAddress, EthAddress.random()];

      mockNodeKeyStore.getPublisherAddresses.mockReturnValue(allowedPublishers);
      mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);

      const result = await factory.create(validatorAddress);

      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(true);

      expect(result.attestorAddress).toBe(validatorAddress);
      expect(result.publisher.getSenderAddress().equals(publisherAddress)).toBe(true);
    });

    it('should handle empty allowed publishers list', async () => {
      mockNodeKeyStore.getPublisherAddresses.mockReturnValue([]);

      const result = await factory.create(validatorAddress);

      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(false);

      expect(result.attestorAddress).toBe(validatorAddress);
    });

    it('should create SequencerPublisher with correct configuration', async () => {
      mockNodeKeyStore.getAttestorForPublisher.mockReturnValue(attestorAddress);
      const mockSlashingProposer = { address: EthAddress.random() };
      mockRollupContract.getSlashingProposer.mockResolvedValue(mockSlashingProposer as any);

      const result = await factory.create();

      expect(result.publisher).toBeDefined();
      expect(mockRollupContract.getSlashingProposer).toHaveBeenCalled();
      expect(result.publisher.slashingProposerContract!.address.equals(mockSlashingProposer.address)).toBe(true);
    });
  });
});
