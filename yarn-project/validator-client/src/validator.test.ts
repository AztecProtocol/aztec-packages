import type { EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { SecretValue, getConfigFromMappings } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import {
  AuthRequest,
  AuthResponse,
  type P2P,
  type PeerId,
  StatusMessage,
  type TxProvider,
  createSecp256k1PeerId,
} from '@aztec/p2p';
import { computeInHashFromL1ToL2Messages } from '@aztec/prover-client/helpers';
import { Offense, type SlasherConfig, WANT_TO_SLASH_EVENT } from '@aztec/slasher';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import { Gas } from '@aztec/stdlib/gas';
import type { BuildBlockResult, IFullNodeBlockBuilder } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, makeBlockProposal, makeHeader, mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { ContentCommitment, TxHash, type TxWithHash } from '@aztec/stdlib/tx';
import { AttestationTimeoutError, InvalidValidatorPrivateKeyError } from '@aztec/stdlib/validators';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type PrivateKeyAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { type ValidatorClientConfig, validatorClientConfigMappings } from './config.js';
import { ValidatorClient } from './validator.js';

describe('ValidatorClient', () => {
  let config: ValidatorClientConfig &
    Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>;
  let validatorClient: ValidatorClient;
  let p2pClient: MockProxy<P2P>;
  let blockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
  let validatorAccounts: PrivateKeyAccount[];
  let dateProvider: TestDateProvider;
  let txProvider: MockProxy<TxProvider>;

  beforeEach(() => {
    p2pClient = mock<P2P>();
    p2pClient.getAttestationsForSlot.mockImplementation(() => Promise.resolve([]));
    p2pClient.handleAuthRequestFromPeer.mockResolvedValue(StatusMessage.random());
    blockBuilder = mock<IFullNodeBlockBuilder>();
    blockBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
    });
    epochCache = mock<EpochCache>();
    blockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    txProvider = mock<TxProvider>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    dateProvider = new TestDateProvider();

    const validatorPrivateKeys = [generatePrivateKey(), generatePrivateKey()];
    validatorAccounts = validatorPrivateKeys.map(privateKey => privateKeyToAccount(privateKey));

    config = {
      validatorPrivateKeys: new SecretValue(validatorPrivateKeys),
      attestationPollingIntervalMs: 1000,
      disableValidator: false,
      validatorReexecute: false,
      validatorReexecuteDeadlineMs: 6000,
      slashInvalidBlockEnabled: true,
      slashInvalidBlockPenalty: 1n,
      slashInvalidBlockMaxPenalty: 100n,
    };
    validatorClient = ValidatorClient.new(
      config,
      blockBuilder,
      epochCache,
      p2pClient,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      dateProvider,
    );
  });

  describe('constructor', () => {
    it('should throw error if an invalid private key is provided', () => {
      config.validatorPrivateKeys = new SecretValue(['0x1234567890123456789']);
      expect(() =>
        ValidatorClient.new(
          config,
          blockBuilder,
          epochCache,
          p2pClient,
          blockSource,
          l1ToL2MessageSource,
          txProvider,
          dateProvider,
        ),
      ).toThrow(InvalidValidatorPrivateKeyError);
    });
  });

  describe('createBlockProposal', () => {
    it('should create a valid block proposal without txs', async () => {
      const header = makeHeader();
      const archive = Fr.random();
      const txs = await Promise.all([1, 2, 3, 4, 5].map(() => mockTx()));

      const blockProposal = await validatorClient.createBlockProposal(
        header.globalVariables.blockNumber,
        header.toPropose(),
        archive,
        header.state,
        txs,
        EthAddress.fromString(validatorAccounts[0].address),
        { publishFullTxs: false },
      );

      expect(blockProposal).toBeDefined();

      const validatorAddress = EthAddress.fromString(validatorAccounts[0].address);
      expect(blockProposal?.getSender()).toEqual(validatorAddress);
      expect(blockProposal!.txs).toBeUndefined();
    });
  });

  describe('collectAttestations', () => {
    it('should timeout if we do not collect enough attestations in time', async () => {
      const proposal = makeBlockProposal();

      await expect(
        validatorClient.collectAttestations(proposal, 2, new Date(dateProvider.now() + 100)),
      ).rejects.toThrow(AttestationTimeoutError);
    });

    it('should collect attestations for a proposal', async () => {
      const signer = Secp256k1Signer.random();
      const attestor1 = Secp256k1Signer.random();
      const attestor2 = Secp256k1Signer.random();

      const archive = Fr.random();
      const txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

      const proposal = makeBlockProposal({ signer, archive, txHashes });

      // Mock the attestations to be returned
      const expectedAttestations = [
        makeBlockAttestation({ signer, archive, txHashes }),
        makeBlockAttestation({ signer: attestor1, archive, txHashes }),
        makeBlockAttestation({ signer: attestor2, archive, txHashes }),
      ];
      p2pClient.getAttestationsForSlot.mockImplementation((slot, proposalId) => {
        if (slot === proposal.payload.header.slotNumber.toBigInt() && proposalId === proposal.archive.toString()) {
          return Promise.resolve(expectedAttestations);
        }
        return Promise.resolve([]);
      });

      // Perform the query
      const numberOfRequiredAttestations = 3;
      const attestations = await validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        new Date(dateProvider.now() + 5000),
      );

      expect(attestations).toHaveLength(numberOfRequiredAttestations);
    });

    it('should collect attestations from its own validators', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce(
        validatorAccounts.map(account => EthAddress.fromString(account.address)),
      );
      const addAttestationsSpy = jest.spyOn(p2pClient, 'addAttestations');
      const proposal = makeBlockProposal();
      // collectAttestations still throws as we don't have a real p2pClient
      await expect(
        validatorClient.collectAttestations(proposal, 3, new Date(dateProvider.now() + 100)),
      ).rejects.toThrow(AttestationTimeoutError);
      expect(addAttestationsSpy).toHaveBeenCalled();
      expect(addAttestationsSpy.mock.calls[0][0]).toHaveLength(2);
    });
  });

  describe('attestToProposal', () => {
    let proposal: BlockProposal;
    let sender: PeerId;
    let blockBuildResult: BuildBlockResult;

    const makeTxFromHash = (txHash: TxHash) => ({ getTxHash: () => Promise.resolve(txHash), txHash }) as TxWithHash;

    const enableReexecution = () => {
      (validatorClient as any).config.validatorReexecute = true;
      blockBuilder.buildBlock.mockImplementation(() => Promise.resolve(blockBuildResult));
    };

    beforeEach(async () => {
      const emptyInHash = await computeInHashFromL1ToL2Messages([]);
      const contentCommitment = new ContentCommitment(Fr.random(), emptyInHash, Fr.random());
      proposal = makeBlockProposal({ header: makeHeader(1, 100, 100, { contentCommitment }) });
      // Set the current time to the start of the slot of the proposal
      const genesisTime = 1n;
      const slotTime = genesisTime + proposal.slotNumber.toBigInt() * BigInt(blockBuilder.getConfig().slotDuration);
      dateProvider.setTime(Number(slotTime * 1000n));
      sender = { toString: () => 'proposal-sender-peer-id' } as PeerId;

      p2pClient.getTxStatus.mockResolvedValue('pending');
      p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(times(txHashes.length, () => true)));
      p2pClient.getTxsByHash.mockImplementation((txHashes: TxHash[]) => Promise.resolve(txHashes.map(makeTxFromHash)));

      txProvider.getTxsForBlockProposal.mockImplementation((proposal: BlockProposal) =>
        Promise.resolve({
          txs: proposal.txHashes.map(makeTxFromHash),
          missingTxs: [],
        }),
      );

      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposal.getSender(),
        nextProposer: proposal.getSender(),
        currentSlot: proposal.slotNumber.toBigInt(),
        nextSlot: proposal.slotNumber.toBigInt() + 1n,
      });
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);

      blockSource.getBlock.mockResolvedValue({
        archive: new AppendOnlyTreeSnapshot(proposal.payload.header.lastArchiveRoot, proposal.blockNumber),
      } as L2Block);
      blockSource.syncImmediate.mockImplementation(() => Promise.resolve());

      blockBuildResult = {
        publicProcessorDuration: 0,
        numTxs: proposal.txHashes.length,
        blockBuildingTimer: new Timer(),
        failedTxs: [],
        publicGas: Gas.empty(),
        numMsgs: 0,
        usedTxs: [],
        block: {
          header: makeHeader(),
          body: { txEffects: times(proposal.txHashes.length, () => ({})) },
          archive: new AppendOnlyTreeSnapshot(proposal.archive, proposal.blockNumber),
        } as L2Block,
      };
    });

    it('should attest to proposal', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeDefined();
      expect(attestations?.length).toBe(1);
    });

    it('should wait for previous block to sync', async () => {
      epochCache.filterInCommittee.mockResolvedValue([EthAddress.fromString(validatorAccounts[0].address)]);
      blockSource.getBlock.mockResolvedValueOnce(undefined);
      blockSource.getBlock.mockResolvedValueOnce(undefined);
      blockSource.getBlock.mockResolvedValueOnce(undefined);
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(blockSource.getBlock).toHaveBeenCalledTimes(4);
      expect(attestations).toBeDefined();
      expect(attestations?.length).toBe(1);
    });

    it('should re-execute and attest to proposal', async () => {
      enableReexecution();
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations?.length).toBeGreaterThan(0);
    });

    it('should not attest to proposal if roots do not match, and should emit WANT_TO_SLASH_EVENT', async () => {
      // Block builder returns a block with a different root
      const emitSpy = jest.spyOn(validatorClient, 'emit');
      enableReexecution();
      blockBuildResult.block.archive.root = Fr.random();

      // We should not attest to the proposal
      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeUndefined();

      // We should emit WANT_TO_SLASH_EVENT
      const proposer = proposal.getSender();
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: proposer,
          amount: config.slashInvalidBlockPenalty,
          offense: Offense.INVALID_BLOCK,
        },
      ]);

      // We "remember" that we want to slash this person, up to the max penalty...
      await expect(
        validatorClient.shouldSlash({
          validator: proposer,
          amount: config.slashInvalidBlockMaxPenalty,
          offense: Offense.INVALID_BLOCK,
        }),
      ).resolves.toBe(true);

      // ...but no more than that
      await expect(
        validatorClient.shouldSlash({
          validator: proposer,
          amount: config.slashInvalidBlockMaxPenalty + 1n,
          offense: Offense.INVALID_BLOCK,
        }),
      ).resolves.toBe(false);
    });

    it('should not emit WANT_TO_SLASH_EVENT if slashing is disabled', async () => {
      validatorClient.configureSlashing({ slashInvalidBlockEnabled: false });

      const emitSpy = jest.spyOn(validatorClient, 'emit');
      enableReexecution();
      blockBuildResult.block.archive.root = Fr.random();

      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations).toBeUndefined();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should request txs for attesting pinning the sender', async () => {
      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeDefined();

      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledWith(
        proposal,
        expect.objectContaining({ pinnedPeer: sender }),
      );
    });

    it('should request txs even if not attestor in this slot', async () => {
      epochCache.filterInCommittee.mockResolvedValue([]);

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();

      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledWith(
        proposal,
        expect.objectContaining({ pinnedPeer: sender }),
      );
    });

    it('should throw an error if the transactions are not available', async () => {
      txProvider.getTxsForBlockProposal.mockImplementation(proposal =>
        Promise.resolve({
          txs: [],
          missingTxs: proposal.txHashes,
        }),
      );

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if re-execution fails', async () => {
      enableReexecution();
      blockBuilder.buildBlock.mockImplementation(() => {
        throw new Error('Failed to build block');
      });

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if no validators are in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce([]);

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if the proposer is not the current proposer', async () => {
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockImplementation(() =>
        Promise.resolve({
          currentProposer: EthAddress.random(),
          nextProposer: EthAddress.random(),
          currentSlot: proposal.slotNumber.toBigInt(),
          nextSlot: proposal.slotNumber.toBigInt() + 1n,
        }),
      );

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should attest with all validator keys that are in the committee', async () => {
      epochCache.filterInCommittee.mockResolvedValueOnce(
        validatorAccounts.map(account => EthAddress.fromString(account.address)),
      );

      const attestations = await validatorClient.attestToProposal(proposal, sender);
      expect(attestations?.length).toBe(validatorAccounts.length);
    });

    it('should not return an attestation if the proposal is not for the current or next slot', async () => {
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposal.getSender(),
        nextProposer: proposal.getSender(),
        currentSlot: proposal.slotNumber.toBigInt() + 20n,
        nextSlot: proposal.slotNumber.toBigInt() + 21n,
      });

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });

    it('should not return an attestation if messages do not match', async () => {
      enableReexecution();
      l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([Fr.random()]);

      const attestation = await validatorClient.attestToProposal(proposal, sender);
      expect(attestation).toBeUndefined();
    });
  });

  describe('handling auth requests', () => {
    const callHandler = (validator: ValidatorClient, peerId: PeerId, msg: Buffer): Promise<Buffer> => {
      return (validator as any).handleAuthRequest(peerId, msg);
    };

    it('should return empty buffer if auth request is not from a peer we trust with our identity', async () => {
      p2pClient.handleAuthRequestFromPeer.mockRejectedValueOnce('Unauthorised');
      const peerId = await createSecp256k1PeerId();
      const msg = AuthRequest.random().toBuffer();
      const res = await callHandler(validatorClient, peerId, msg);
      expect(res).toEqual(Buffer.alloc(0));
    });

    it('should return empty buffer if validator is not registered', async () => {
      // Our address is not one of those registered
      epochCache.getRegisteredValidators.mockResolvedValueOnce(
        times(10, () => new Secp256k1Signer(Buffer32.fromString(generatePrivateKey())).address),
      );
      const peerId = await createSecp256k1PeerId();
      const msg = AuthRequest.random().toBuffer();
      const res = await callHandler(validatorClient, peerId, msg);
      expect(res).toEqual(Buffer.alloc(0));
    });

    it('should return serialised auth response if we are responding to auth request', async () => {
      // Set up our auth peer handler
      const ourStatus = StatusMessage.random();
      p2pClient.handleAuthRequestFromPeer.mockResolvedValueOnce(ourStatus);
      // Make sure our addresses are registered
      epochCache.getRegisteredValidators.mockResolvedValueOnce(validatorClient.getValidatorAddresses());
      const peerId = await createSecp256k1PeerId();
      const request = AuthRequest.random();
      const res = await callHandler(validatorClient, peerId, request.toBuffer());

      const authResponse = AuthResponse.fromBuffer(res);
      expect(authResponse.status.equals(ourStatus)).toBeTruthy();

      // We should have used the first address to sign
      const payloadToSign = request.getPayloadToSign();
      const firstSigner = new Secp256k1Signer(Buffer32.fromString(config.validatorPrivateKeys.getValue()[0]));
      const signature = firstSigner.sign(payloadToSign);
      expect(authResponse.signature.equals(signature)).toBeTruthy();
    });

    it('should sign with the first registered address', async () => {
      // Set up our auth peer handler
      const ourStatus = StatusMessage.random();
      p2pClient.handleAuthRequestFromPeer.mockResolvedValueOnce(ourStatus);
      // Make sure our addresses are registered
      const registeredAddress = validatorClient.getValidatorAddresses()[1];
      const validatorPrivateKey = config.validatorPrivateKeys.getValue()[1];
      epochCache.getRegisteredValidators.mockResolvedValueOnce([registeredAddress]);
      const peerId = await createSecp256k1PeerId();
      const request = AuthRequest.random();
      const res = await callHandler(validatorClient, peerId, request.toBuffer());

      const authResponse = AuthResponse.fromBuffer(res);
      expect(authResponse.status.equals(ourStatus)).toBeTruthy();

      // We should have used the second address to sign as this is the only one registered
      const payloadToSign = request.getPayloadToSign();
      const firstSigner = new Secp256k1Signer(Buffer32.fromString(validatorPrivateKey));
      const signature = firstSigner.sign(payloadToSign);
      expect(authResponse.signature.equals(signature)).toBeTruthy();
    });
  });

  describe('configuration', () => {
    it('should use VALIDATOR_PRIVATE_KEY for validatorPrivateKeys when VALIDATOR_PRIVATE_KEYS is not set', () => {
      const originalEnv = process.env;
      const testPrivateKey = '0x' + '1'.repeat(64);

      process.env = {
        ...originalEnv,
        VALIDATOR_PRIVATE_KEY: testPrivateKey,
        VALIDATOR_PRIVATE_KEYS: undefined,
      };

      const config = getConfigFromMappings<ValidatorClientConfig>(validatorClientConfigMappings);
      expect(config.validatorPrivateKeys.getValue()).toHaveLength(1);
      expect(config.validatorPrivateKeys.getValue()[0]).toBe(process.env.VALIDATOR_PRIVATE_KEY);
    });
  });
});
