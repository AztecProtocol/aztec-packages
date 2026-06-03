import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { DateProvider } from '@aztec/foundation/timer';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NodeKeystoreAdapter } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { SequencerClientConfig } from '../config.js';
import { SequencerPublisherFactory } from './sequencer-publisher-factory.js';

describe('SequencerPublisherFactory', () => {
  let factory: SequencerPublisherFactory;
  let mockConfig: SequencerClientConfig;
  let mockPublisherManager: MockProxy<PublisherManager<L1TxUtils>>;
  let mockBlobClient: MockProxy<BlobClientInterface>;
  let mockDateProvider: MockProxy<DateProvider>;
  let mockEpochCache: MockProxy<EpochCache>;
  let mockRollupContract: MockProxy<RollupContract>;
  let mockGovernanceProposerContract: MockProxy<GovernanceProposerContract>;
  let mockNodeKeyStore: MockProxy<NodeKeystoreAdapter>;
  let mockL1TxUtils: MockProxy<L1TxUtils>;

  const validatorAddress = EthAddress.random();
  const publisherAddress = EthAddress.random();
  const attestorAddress = EthAddress.random();

  beforeEach(() => {
    mockConfig = {
      ethereumSlotDuration: 12,
      aztecSlotDuration: 36,
    } as SequencerClientConfig;
    mockPublisherManager = mock<PublisherManager<L1TxUtils>>();
    mockBlobClient = mock<BlobClientInterface>();
    mockDateProvider = mock<DateProvider>();
    mockEpochCache = mock<EpochCache>();
    mockNodeKeyStore = mock<NodeKeystoreAdapter>();
    mockL1TxUtils = mock<L1TxUtils>();
    mockRollupContract = mock<RollupContract>();
    mockGovernanceProposerContract = mock<GovernanceProposerContract>();

    mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);
    mockPublisherManager.getAvailablePublisher.mockResolvedValue(mockL1TxUtils);
    mockRollupContract.getSlashingProposer.mockResolvedValue({} as any);

    factory = new SequencerPublisherFactory(mockConfig, {
      telemetry: getTelemetryClient(),
      publisherManager: mockPublisherManager,
      blobClient: mockBlobClient,
      dateProvider: mockDateProvider,
      epochCache: mockEpochCache,
      governanceProposerContract: mockGovernanceProposerContract,
      rollupContract: mockRollupContract,
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

    it('should reject validator added via updateNodeKeyStore with a different publisher key', async () => {
      // Initial keystore knows validator → publisherAddress
      mockNodeKeyStore.getPublisherAddresses.mockReturnValue([publisherAddress]);

      // After updateNodeKeyStore, a new validator maps to a DIFFERENT publisher key
      const newValidatorAddress = EthAddress.random();
      const differentPublisherAddress = EthAddress.random();
      const updatedKeyStore = mock<NodeKeystoreAdapter>();
      updatedKeyStore.getPublisherAddresses.mockImplementation((addr: EthAddress) => {
        if (addr.equals(newValidatorAddress)) {
          return [differentPublisherAddress]; // not in L1TxUtils pool
        }
        return [publisherAddress];
      });

      factory.updateNodeKeyStore(updatedKeyStore);

      // The L1TxUtils pool only has publisherAddress, not differentPublisherAddress
      mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);
      mockPublisherManager.getAvailablePublisher.mockRejectedValueOnce(
        new Error('Failed to find an available publisher.'),
      );

      await expect(factory.create(newValidatorAddress)).rejects.toThrow('Failed to find an available publisher.');

      // Verify the filter rejects the available publisher (wrong key)
      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(false);
    });

    it('should allow validator added via updateNodeKeyStore with an existing publisher key', async () => {
      // A new validator maps to the SAME publisher key that's already in the L1TxUtils pool
      const newValidatorAddress = EthAddress.random();
      const updatedKeyStore = mock<NodeKeystoreAdapter>();
      updatedKeyStore.getPublisherAddresses.mockImplementation((addr: EthAddress) => {
        if (addr.equals(newValidatorAddress)) {
          return [publisherAddress]; // same key as L1TxUtils
        }
        return [];
      });

      factory.updateNodeKeyStore(updatedKeyStore);

      mockL1TxUtils.getSenderAddress.mockReturnValue(publisherAddress);

      const result = await factory.create(newValidatorAddress);

      // Verify the filter accepts the publisher (same key)
      const filterFn = mockPublisherManager.getAvailablePublisher.mock.calls[0][0]!;
      expect(filterFn(mockL1TxUtils)).toBe(true);

      expect(result.attestorAddress).toBe(newValidatorAddress);
      expect(result.publisher).toBeDefined();
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

    it('should interrupt created publishers during stopAll', async () => {
      mockNodeKeyStore.getAttestorForPublisher.mockReturnValue(attestorAddress);
      const { publisher } = await factory.create();
      const interruptSpy = jest.spyOn(publisher, 'interrupt');

      await factory.stopAll();

      expect(interruptSpy).toHaveBeenCalledTimes(1);
      expect(mockPublisherManager.stop).toHaveBeenCalledTimes(1);
    });
  });
});
