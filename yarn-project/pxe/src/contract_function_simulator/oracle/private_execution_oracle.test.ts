import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { AppTaggingSecret, AppTaggingSecretKind } from '@aztec/stdlib/logs';
import { type BlockHeader, CallContext, type Capsule, TxContext } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import type { ResolveCustomRequest } from '../../hooks/resolve_custom_request.js';
import type {
  ResolveTaggingSecretStrategy,
  TaggingSecretStrategy,
} from '../../hooks/resolve_tagging_secret_strategy.js';
import type { TxResolverService } from '../../messages/tx_resolver_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import { FactService } from '../../storage/fact_store/index.js';
import type { FactStore } from '../../storage/fact_store/index.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../../storage/tagging_store/tagging_secret_sources_store.js';
import { ExecutionNoteCache } from '../execution_note_cache.js';
import { ExecutionTaggingIndexCache } from '../execution_tagging_index_cache.js';
import { HashedValuesCache } from '../hashed_values_cache.js';
import { Option } from '../noir-structs/option.js';
import { TransientArrayService } from '../transient_array_service.js';
import { PrivateExecutionOracle, type PrivateExecutionOracleArgs } from './private_execution_oracle.js';

describe('PrivateExecutionOracle', () => {
  let contractAddress: AztecAddress;
  let callContext: CallContext;
  let txContext: TxContext;

  beforeAll(async () => {
    contractAddress = await AztecAddress.random();
    callContext = new CallContext(
      AztecAddress.fromFieldUnsafe(Fr.MAX_FIELD_VALUE),
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

  describe('resolveTaggingStrategy', () => {
    let sender: AztecAddress;
    let recipient: AztecAddress;

    beforeAll(async () => {
      sender = await AztecAddress.random();
      recipient = await AztecAddress.random();
    });

    it('defaults unconstrained delivery to an external recipient to a non-interactive handshake', async () => {
      const oracle = makeOracle({ keyStore: makeKeyStore({ ownsRecipient: false }) });

      await expect(
        oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual({ type: 'non-interactive-handshake' });
    });

    it('defaults an unconstrained self-send to an address-derived shared secret', async () => {
      const oracle = makeOracle({ keyStore: makeKeyStore({ ownsRecipient: true }) });
      const secret = Fr.random();
      jest.spyOn(oracle, 'getAppTaggingSecret').mockResolvedValue(Option.some(secret));

      await expect(
        oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual({ type: 'unconstrained-secret', secret });
    });

    it('defaults constrained delivery to a non-interactive handshake when no hooks are configured', async () => {
      const oracle = makeOracle();

      await expect(oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.CONSTRAINED)).resolves.toEqual(
        {
          type: 'non-interactive-handshake',
        },
      );
    });

    it('resolves a non-interactive-handshake strategy', async () => {
      const { oracle } = await makeHookedOracle({ strategy: { type: 'non-interactive-handshake' } });

      await expect(oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.CONSTRAINED)).resolves.toEqual(
        {
          type: 'non-interactive-handshake',
        },
      );
    });

    it('resolves an address-derived strategy to the unconstrained secret', async () => {
      const { oracle } = await makeHookedOracle({ strategy: { type: 'address-derived' } });
      const secret = Fr.random();
      jest.spyOn(oracle, 'getAppTaggingSecret').mockResolvedValue(Option.some(secret));

      await expect(
        oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual({ type: 'unconstrained-secret', secret });
    });

    it('app-silos a raw arbitrary-secret point before handing it to the contract', async () => {
      const point = await Point.random();
      const { oracle } = await makeHookedOracle({ strategy: { type: 'arbitrary-secret', secret: point } });

      const expected = await AppTaggingSecret.computeDirectional(point, contractAddress, recipient);
      await expect(
        oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual({ type: 'unconstrained-secret', secret: expected.secret });
    });

    it('overrides a hooked non-interactive handshake on an unconstrained self-send with an address-derived secret', async () => {
      const { oracle } = await makeHookedOracle({
        strategy: { type: 'non-interactive-handshake' },
        keyStore: makeKeyStore({ ownsRecipient: true }),
      });
      const secret = Fr.random();
      jest.spyOn(oracle, 'getAppTaggingSecret').mockResolvedValue(Option.some(secret));

      await expect(
        oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.UNCONSTRAINED),
      ).resolves.toEqual({ type: 'unconstrained-secret', secret });
    });

    it('keeps a hooked non-interactive handshake under constrained delivery even when the wallet owns the recipient', async () => {
      const { oracle } = await makeHookedOracle({
        strategy: { type: 'non-interactive-handshake' },
        keyStore: makeKeyStore({ ownsRecipient: true }),
      });

      await expect(oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.CONSTRAINED)).resolves.toEqual(
        { type: 'non-interactive-handshake' },
      );
    });

    it('passes the correct message context to the hook', async () => {
      const contractClassId = Fr.random();
      const { oracle, resolveTaggingSecretStrategy } = await makeHookedOracle({
        strategy: { type: 'non-interactive-handshake' },
        contractClassId,
      });

      await oracle.resolveTaggingStrategy(sender, recipient, AppTaggingSecretKind.CONSTRAINED);

      expect(resolveTaggingSecretStrategy).toHaveBeenCalledWith({
        contractAddress,
        contractClassId,
        sender,
        recipient,
        deliveryMode: AppTaggingSecretKind.CONSTRAINED,
      });
    });

    const makeHookedOracle = async ({
      strategy,
      contractClassId = Fr.random(),
      keyStore = makeKeyStore({ ownsRecipient: false }),
    }: {
      strategy: TaggingSecretStrategy;
      contractClassId?: Fr;
      keyStore?: KeyStore;
    }) => {
      const resolveTaggingSecretStrategy = jest.fn<ResolveTaggingSecretStrategy>().mockResolvedValue(strategy);
      const oracle = makeOracle({ hooks: { resolveTaggingSecretStrategy }, keyStore });
      jest
        .spyOn(oracle, 'getContractInstance')
        .mockResolvedValue(await SerializableContractInstance.random({ currentContractClassId: contractClassId }));
      return { oracle, resolveTaggingSecretStrategy };
    };

    const makeKeyStore = ({ ownsRecipient }: { ownsRecipient: boolean }) => {
      const keyStore = mock<KeyStore>();
      keyStore.hasAccount.mockResolvedValue(ownsRecipient);
      return keyStore;
    };
  });

  describe('resolveCustomRequest', () => {
    it('relays the request to the hook with the issuing contract context and returns its result', async () => {
      const result = [Fr.random(), Fr.random()];
      const resolveCustomRequest = jest.fn<ResolveCustomRequest>().mockResolvedValue(result);
      const oracle = makeOracle({ hooks: { resolveCustomRequest } });
      const contractClassId = Fr.random();
      jest
        .spyOn(oracle, 'getContractInstance')
        .mockResolvedValue(await SerializableContractInstance.random({ currentContractClassId: contractClassId }));

      const kind = Fr.random();
      const payload = [Fr.random(), Fr.random(), Fr.random()];
      await expect(oracle.resolveCustomRequest(kind, payload)).resolves.toEqual(result);
      expect(resolveCustomRequest).toHaveBeenCalledWith({ contractAddress, contractClassId, kind, payload });
    });

    it('throws when no resolveCustomRequest hook is configured', async () => {
      const oracle = makeOracle();
      await expect(oracle.resolveCustomRequest(Fr.random(), [Fr.random()])).rejects.toThrow(
        'no resolveCustomRequest hook',
      );
    });
  });

  const makeOracle = (overrides: Partial<PrivateExecutionOracleArgs> = {}): PrivateExecutionOracle => {
    return new PrivateExecutionOracle({
      argsHash: Fr.ZERO,
      txContext,
      txRequestSalt: Fr.ZERO,
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
      taggingSecretSourcesStore: mock<TaggingSecretSourcesStore>(),
      capsuleService: new CapsuleService(mock<CapsuleStore>(), []),
      factService: new FactService(mock<FactStore>(), []),
      privateEventStore: mock<PrivateEventStore>(),
      txResolver: mock<TxResolverService>(),
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
