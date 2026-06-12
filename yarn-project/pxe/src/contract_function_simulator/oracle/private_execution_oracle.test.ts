import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { AppTaggingSecretKind } from '@aztec/stdlib/logs';
import { type BlockHeader, CallContext, type Capsule, TxContext } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import {
  DeliveryPrivacyPreference,
  type GetDeliveryPrivacyPreference,
} from '../../hooks/get_delivery_privacy_preference.js';
import type { MessageContextService } from '../../messages/message_context_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ExecutionNoteCache } from '../execution_note_cache.js';
import { ExecutionTaggingIndexCache } from '../execution_tagging_index_cache.js';
import { HashedValuesCache } from '../hashed_values_cache.js';
import { TransientArrayService } from '../transient_array_service.js';
import { PrivateExecutionOracle, type PrivateExecutionOracleArgs } from './private_execution_oracle.js';

describe('PrivateExecutionOracle', () => {
  let contractAddress: AztecAddress;
  let callContext: CallContext;
  let txContext: TxContext;

  beforeAll(async () => {
    contractAddress = await AztecAddress.random();
    callContext = new CallContext(
      AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
      contractAddress,
      FunctionSelector.empty(),
      false,
    );
    txContext = TxContext.from({
      chainId: new Fr(10),
      version: new Fr(20),
      gasSettings: GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
        maxFeesPerGas: new GasFees(10, 10),
      }),
    });
  });

  describe('senderForTags', () => {
    it('returns the initial default', async () => {
      const wallet = await AztecAddress.random();
      const oracle = makeOracle({ senderForTags: wallet });

      const result = await oracle.getSenderForTags();
      expect(result.value).toEqual(wallet);
    });

    it('returns none when no default was provided', async () => {
      const oracle = makeOracle();

      const result = await oracle.getSenderForTags();
      expect(result.isNone()).toBe(true);
    });
  });

  describe('deliveryPrivacyPreference', () => {
    let sender: AztecAddress;
    let recipient: AztecAddress;

    beforeAll(async () => {
      sender = await AztecAddress.random();
      recipient = await AztecAddress.random();
    });

    it('defaults to max privacy when no hooks are configured', async () => {
      const oracle = makeOracle();

      await expect(
        oracle.getDeliveryPrivacyPreference(sender, recipient, AppTaggingSecretKind.CONSTRAINED),
      ).resolves.toEqual(DeliveryPrivacyPreference.MAX_PRIVACY);
    });

    it('returns the preference reported by the wallet hook', async () => {
      const getDeliveryPrivacyPreference = jest
        .fn<GetDeliveryPrivacyPreference>()
        .mockResolvedValue(DeliveryPrivacyPreference.BEST_EFFORT);
      const oracle = makeOracle({ hooks: { getDeliveryPrivacyPreference } });

      await expect(
        oracle.getDeliveryPrivacyPreference(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual(DeliveryPrivacyPreference.BEST_EFFORT);
      expect(getDeliveryPrivacyPreference).toHaveBeenCalledWith({
        contractAddress,
        sender,
        recipient,
        deliveryMode: AppTaggingSecretKind.UNCONSTRAINED,
      });
    });
  });

  const makeOracle = (overrides: Partial<PrivateExecutionOracleArgs> = {}): PrivateExecutionOracle => {
    return new PrivateExecutionOracle({
      argsHash: Fr.ZERO,
      txContext,
      callContext,
      anchorBlockHeader: mock<BlockHeader>(),
      utilityExecutor: () => Promise.resolve(),
      authWitnesses: [] as AuthWitness[],
      capsules: [] as Capsule[],
      executionCache: HashedValuesCache.create([]),
      noteCache: new ExecutionNoteCache(Fr.ZERO),
      taggingIndexCache: new ExecutionTaggingIndexCache(),
      contractStore: mock<ContractStore>(),
      noteStore: mock<NoteStore>(),
      keyStore: mock<KeyStore>(),
      addressStore: mock<AddressStore>(),
      aztecNode: mock<AztecNode>(),
      senderTaggingStore: mock<SenderTaggingStore>(),
      recipientTaggingStore: mock<RecipientTaggingStore>(),
      senderAddressBookStore: mock<SenderAddressBookStore>(),
      capsuleService: new CapsuleService(mock<CapsuleStore>(), []),
      privateEventStore: mock<PrivateEventStore>(),
      messageContextService: mock<MessageContextService>(),
      contractSyncService: mock<ContractSyncService>(),
      l2TipsStore: mock<L2TipsProvider>(),
      jobId: 'test',
      scopes: [],
      simulator: new WASMSimulator(),
      transientArrayService: new TransientArrayService(),
      ...overrides,
    });
  };
});
