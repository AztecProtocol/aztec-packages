import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import type { EthRemoteSignerConfig } from '@aztec/node-keystore';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';
import { DutyType, type SigningContext, isHAProtectedContext } from '@aztec/validator-ha-signer/types';
import type { ValidatorHASigner } from '@aztec/validator-ha-signer/validator-ha-signer';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TypedDataDefinition } from 'viem';

import { HAKeyStore } from './ha_key_store.js';
import type { ExtendedValidatorKeyStore } from './interface.js';

// Test data constants
const VALIDATOR_ADDRESS = EthAddress.random();
const VALIDATOR_ADDRESS_2 = EthAddress.random();
const SIGNING_ROOT = Buffer32.random();
const NODE_ID = 'test-node-1';
const SIGNATURE_STRING = '0xsignature123';

// Mock signature
const mockSignature = {
  toString: () => SIGNATURE_STRING,
  r: Buffer32.random(),
  s: Buffer32.random(),
  v: 27,
  isEmpty: false,
} as unknown as Signature;

// Mock typed data
const mockTypedData: TypedDataDefinition = {
  domain: {
    name: 'Test',
    version: '1',
    chainId: 1,
  },
  types: {
    Message: [{ name: 'content', type: 'string' }],
  },
  primaryType: 'Message',
  message: {
    content: 'test message',
  },
};

describe('HAKeyStore', () => {
  let mockBaseKeyStore: jest.Mocked<ExtendedValidatorKeyStore>;
  let mockHASigner: jest.Mocked<ValidatorHASigner>;

  beforeEach(() => {
    // Create mock base key store
    mockBaseKeyStore = {
      getAddress: jest.fn<(index: number) => EthAddress>(),
      getAddresses: jest.fn<() => EthAddress[]>(),
      signTypedData: jest.fn<(typedData: TypedDataDefinition, context: SigningContext) => Promise<Signature[]>>(),
      signTypedDataWithAddress:
        jest.fn<(address: EthAddress, typedData: TypedDataDefinition, context: SigningContext) => Promise<Signature>>(),
      signMessage: jest.fn<(message: Buffer32, context: SigningContext) => Promise<Signature[]>>(),
      signMessageWithAddress:
        jest.fn<(address: EthAddress, message: Buffer32, context: SigningContext) => Promise<Signature>>(),
      getAttesterAddresses: jest.fn<() => EthAddress[]>(),
      getCoinbaseAddress: jest.fn<(attesterAddress: EthAddress) => EthAddress>(),
      getPublisherAddresses: jest.fn<(attesterAddress: EthAddress) => EthAddress[]>(),
      getFeeRecipient: jest.fn<(attesterAddress: EthAddress) => AztecAddress>(),
      getRemoteSignerConfig: jest.fn<(attesterAddress: EthAddress) => EthRemoteSignerConfig | undefined>(),
      start: jest.fn<() => Promise<void>>(),
      stop: jest.fn<() => Promise<void>>(),
    };

    // Create mock HA signer
    mockHASigner = {
      isEnabled: true,
      nodeId: NODE_ID,
      signWithProtection: jest.fn<ValidatorHASigner['signWithProtection']>(),
      start: jest.fn<ValidatorHASigner['start']>(),
      stop: jest.fn<ValidatorHASigner['stop']>(),
    } as unknown as jest.Mocked<ValidatorHASigner>;

    // Default implementations
    mockBaseKeyStore.getAddress.mockReturnValue(VALIDATOR_ADDRESS);
    mockBaseKeyStore.getAddresses.mockReturnValue([VALIDATOR_ADDRESS, VALIDATOR_ADDRESS_2]);
    mockBaseKeyStore.signMessageWithAddress.mockResolvedValue(mockSignature);
    mockBaseKeyStore.signTypedDataWithAddress.mockResolvedValue(mockSignature);
    mockBaseKeyStore.signMessage.mockResolvedValue([mockSignature]);
    mockBaseKeyStore.signTypedData.mockResolvedValue([mockSignature]);
    mockHASigner.signWithProtection.mockResolvedValue(mockSignature);
  });

  describe('ValidatorKeyStore interface delegation (non-HA duties bypass HA)', () => {
    let haKeyStore: HAKeyStore;

    beforeEach(() => {
      haKeyStore = new HAKeyStore(mockBaseKeyStore, mockHASigner);
    });

    it('should delegate getAddress to base key store', () => {
      const result = haKeyStore.getAddress(0);
      expect(result).toBe(VALIDATOR_ADDRESS);
      expect(mockBaseKeyStore.getAddress).toHaveBeenCalledWith(0);
    });

    it('should delegate getAddresses to base key store', () => {
      const result = haKeyStore.getAddresses();
      expect(result).toEqual([VALIDATOR_ADDRESS, VALIDATOR_ADDRESS_2]);
      expect(mockBaseKeyStore.getAddresses).toHaveBeenCalled();
    });

    describe('AUTH_REQUEST duties bypass HA', () => {
      const authRequestContext: SigningContext = { dutyType: DutyType.AUTH_REQUEST };

      it('should delegate signTypedData to base key store for AUTH_REQUEST', async () => {
        const result = await haKeyStore.signTypedData(mockTypedData, authRequestContext);
        expect(result).toEqual([mockSignature]);
        expect(mockBaseKeyStore.signTypedData).toHaveBeenCalledWith(mockTypedData, authRequestContext);
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signMessage to base key store for AUTH_REQUEST', async () => {
        const result = await haKeyStore.signMessage(SIGNING_ROOT, authRequestContext);
        expect(result).toEqual([mockSignature]);
        expect(mockBaseKeyStore.signMessage).toHaveBeenCalledWith(SIGNING_ROOT, authRequestContext);
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signTypedDataWithAddress without HA for AUTH_REQUEST', async () => {
        const result = await haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, authRequestContext);
        expect(result).toBe(mockSignature);
        expect(mockBaseKeyStore.signTypedDataWithAddress).toHaveBeenCalledWith(
          VALIDATOR_ADDRESS,
          mockTypedData,
          authRequestContext,
        );
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signMessageWithAddress without HA for AUTH_REQUEST', async () => {
        const result = await haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, authRequestContext);
        expect(result).toBe(mockSignature);
        expect(mockBaseKeyStore.signMessageWithAddress).toHaveBeenCalledWith(
          VALIDATOR_ADDRESS,
          SIGNING_ROOT,
          authRequestContext,
        );
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });
    });

    describe('TXS duties bypass HA', () => {
      const txsContext: SigningContext = { dutyType: DutyType.TXS };

      it('should delegate signTypedData to base key store for TXS', async () => {
        const result = await haKeyStore.signTypedData(mockTypedData, txsContext);
        expect(result).toEqual([mockSignature]);
        expect(mockBaseKeyStore.signTypedData).toHaveBeenCalledWith(mockTypedData, txsContext);
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signMessage to base key store for TXS', async () => {
        const result = await haKeyStore.signMessage(SIGNING_ROOT, txsContext);
        expect(result).toEqual([mockSignature]);
        expect(mockBaseKeyStore.signMessage).toHaveBeenCalledWith(SIGNING_ROOT, txsContext);
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signTypedDataWithAddress without HA for TXS', async () => {
        const result = await haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, txsContext);
        expect(result).toBe(mockSignature);
        expect(mockBaseKeyStore.signTypedDataWithAddress).toHaveBeenCalledWith(
          VALIDATOR_ADDRESS,
          mockTypedData,
          txsContext,
        );
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });

      it('should delegate signMessageWithAddress without HA for TXS', async () => {
        const result = await haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, txsContext);
        expect(result).toBe(mockSignature);
        expect(mockBaseKeyStore.signMessageWithAddress).toHaveBeenCalledWith(
          VALIDATOR_ADDRESS,
          SIGNING_ROOT,
          txsContext,
        );
        expect(mockHASigner.signWithProtection).not.toHaveBeenCalled();
      });
    });
  });

  describe('signMessageWithAddress with context (HA enabled)', () => {
    let haKeyStore: HAKeyStore;
    const context: SigningContext = {
      slot: SlotNumber(100),
      blockNumber: BlockNumber(50),
      dutyType: DutyType.BLOCK_PROPOSAL,
      blockIndexWithinCheckpoint: 0,
    };

    beforeEach(() => {
      haKeyStore = new HAKeyStore(mockBaseKeyStore, mockHASigner);
    });

    it('should return signature on successful signing', async () => {
      const result = await haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context);

      expect(result).toBe(mockSignature);
      expect(mockHASigner.signWithProtection).toHaveBeenCalledWith(
        VALIDATOR_ADDRESS,
        SIGNING_ROOT,
        {
          slot: context.slot,
          blockNumber: context.blockNumber,
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: 0,
        },
        expect.any(Function),
      );
    });

    it('should throw DutyAlreadySignedError when duty was already signed', async () => {
      const error = new DutyAlreadySignedError(SlotNumber(100), DutyType.BLOCK_PROPOSAL, 0, 'other-node');
      mockHASigner.signWithProtection.mockRejectedValue(error);

      await expect(haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context)).rejects.toThrow(
        DutyAlreadySignedError,
      );
    });

    it('should throw SlashingProtectionError when slashing protection triggers', async () => {
      const error = new SlashingProtectionError(
        SlotNumber(100),
        DutyType.BLOCK_PROPOSAL,
        0,
        '0xexisting',
        '0xattempted',
        'other-node',
      );
      mockHASigner.signWithProtection.mockRejectedValue(error);

      await expect(haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context)).rejects.toThrow(
        SlashingProtectionError,
      );
    });

    it('should re-throw unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockHASigner.signWithProtection.mockRejectedValue(unexpectedError);

      await expect(haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context)).rejects.toThrow(
        'Unexpected error',
      );
    });

    it('should call base key store through signWithProtection callback', async () => {
      mockHASigner.signWithProtection.mockImplementation((_addr, _root, _ctx, signFn) => {
        return signFn(SIGNING_ROOT);
      });

      await haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context);

      expect(mockBaseKeyStore.signMessageWithAddress).toHaveBeenCalledWith(VALIDATOR_ADDRESS, SIGNING_ROOT, context);
    });
  });

  describe('signTypedDataWithAddress with context', () => {
    let haKeyStore: HAKeyStore;
    const context: SigningContext = {
      slot: SlotNumber(100),
      blockNumber: BlockNumber(50),
      dutyType: DutyType.ATTESTATION,
    };

    beforeEach(() => {
      haKeyStore = new HAKeyStore(mockBaseKeyStore, mockHASigner);
    });

    it('should return signature on successful signing', async () => {
      const result = await haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, context);

      expect(result).toBe(mockSignature);
      expect(mockHASigner.signWithProtection).toHaveBeenCalledWith(
        VALIDATOR_ADDRESS,
        expect.any(Buffer32),
        {
          slot: context.slot,
          blockNumber: context.blockNumber,
          dutyType: DutyType.ATTESTATION,
        },
        expect.any(Function),
      );
    });

    it('should throw DutyAlreadySignedError when duty was already signed', async () => {
      const error = new DutyAlreadySignedError(SlotNumber(100), DutyType.ATTESTATION, -1, 'other-node');
      mockHASigner.signWithProtection.mockRejectedValue(error);

      await expect(haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, context)).rejects.toThrow(
        DutyAlreadySignedError,
      );
    });

    it('should throw SlashingProtectionError when slashing protection triggers', async () => {
      const error = new SlashingProtectionError(
        SlotNumber(100),
        DutyType.ATTESTATION,
        -1,
        '0xexisting',
        '0xattempted',
        'other-node',
      );
      mockHASigner.signWithProtection.mockRejectedValue(error);

      await expect(haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, context)).rejects.toThrow(
        SlashingProtectionError,
      );
    });

    it('should call base key store signTypedDataWithAddress through callback', async () => {
      mockHASigner.signWithProtection.mockImplementation((_addr, _root, _ctx, signFn) => {
        return signFn(Buffer32.random());
      });

      await haKeyStore.signTypedDataWithAddress(VALIDATOR_ADDRESS, mockTypedData, context);

      expect(mockBaseKeyStore.signTypedDataWithAddress).toHaveBeenCalledWith(VALIDATOR_ADDRESS, mockTypedData, context);
    });
  });

  describe('all duty types', () => {
    it('should handle all HA-protected duty types', async () => {
      const haKeyStore = new HAKeyStore(mockBaseKeyStore, mockHASigner);

      // Build contexts for each HA-protected duty type
      const haProtectedContexts: SigningContext[] = [
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: 0,
        },
        { slot: SlotNumber(100), blockNumber: BlockNumber(50), dutyType: DutyType.ATTESTATION },
        { slot: SlotNumber(100), blockNumber: BlockNumber(50), dutyType: DutyType.ATTESTATIONS_AND_SIGNERS },
        { slot: SlotNumber(100), blockNumber: BlockNumber(50), dutyType: DutyType.CHECKPOINT_PROPOSAL },
        // Vote duties only need slot (no blockNumber)
        { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
        { slot: SlotNumber(100), dutyType: DutyType.SLASHING_VOTE },
      ];

      for (const context of haProtectedContexts) {
        const result = await haKeyStore.signMessageWithAddress(VALIDATOR_ADDRESS, SIGNING_ROOT, context);
        expect(result).toBe(mockSignature);
      }

      expect(mockHASigner.signWithProtection).toHaveBeenCalledTimes(haProtectedContexts.length);
    });
  });

  describe('lifecycle methods', () => {
    let haKeyStore: HAKeyStore;

    beforeEach(() => {
      haKeyStore = new HAKeyStore(mockBaseKeyStore, mockHASigner);
    });

    it('should run start() on the HA signer', async () => {
      await haKeyStore.start();
      expect(mockHASigner.start).toHaveBeenCalledTimes(1);
    });

    it('should run stop() on the HA signer', async () => {
      await haKeyStore.stop();
      expect(mockHASigner.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('isHAProtectedContext type guard', () => {
    it('should return false for AUTH_REQUEST', () => {
      const context: SigningContext = { dutyType: DutyType.AUTH_REQUEST };
      expect(isHAProtectedContext(context)).toBe(false);
    });

    it('should return false for TXS', () => {
      const context: SigningContext = { dutyType: DutyType.TXS };
      expect(isHAProtectedContext(context)).toBe(false);
    });

    it('should return true for BLOCK_PROPOSAL', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: 0,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });

    it('should return true for ATTESTATION', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.ATTESTATION,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });

    it('should return true for CHECKPOINT_PROPOSAL', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.CHECKPOINT_PROPOSAL,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });

    it('should return true for ATTESTATIONS_AND_SIGNERS', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });

    it('should return true for GOVERNANCE_VOTE', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        dutyType: DutyType.GOVERNANCE_VOTE,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });

    it('should return true for SLASHING_VOTE', () => {
      const context: SigningContext = {
        slot: SlotNumber(100),
        dutyType: DutyType.SLASHING_VOTE,
      };
      expect(isHAProtectedContext(context)).toBe(true);
    });
  });
});
