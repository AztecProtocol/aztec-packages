/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';
import { toACVMField } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeFeeJuiceMessageNullifier } from '@aztec/stdlib/messaging';

import type { FactScope } from '../../storage/fact_store/index.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import type { Fact } from '../noir-structs/fact.js';
import type { FactCollection } from '../noir-structs/fact_collection.js';
import { Option } from '../noir-structs/option.js';
import { buildACIRCallback } from './acir_callback.js';
import { LEGACY_ORACLE_REGISTRY, type LegacyOracleEntry } from './legacy_oracle_registry.js';
import { FIELD, U32 } from './oracle_registry.js';

type Handler = Parameters<typeof buildACIRCallback>[0];

describe('legacy oracle dispatch', () => {
  it('adapts the return wire: handler runs, result is mapped, then serialized through the legacy type', async () => {
    // Fixture scenario: the return override maps the handler's current result to the legacy value the old bytecode
    // expects, then serializes it through the legacy type.
    const handler = { isMisc: true, getRandomField: () => Promise.resolve(new Fr(41)) } as Handler;

    const legacyRegistry: Record<string, LegacyOracleEntry> = {
      aztec_misc_legacyReturn: {
        modernOracle: 'aztec_misc_getRandomField',
        returnType: { legacyType: FIELD, mapping: (result: Fr) => new Fr(result.toBigInt() + 1n) },
      },
    };

    const callback = buildACIRCallback(handler, { legacy: legacyRegistry });

    // Handler produces 41; the override maps it to the legacy value (41 + 1) the old bytecode expects.
    const wire = await callback['aztec_misc_legacyReturn']();

    expect(wire).toEqual([toACVMField(new Fr(42))]);
  });

  it('adapts the param wire: legacy args are deserialized, mapped, then passed to the modern handler', async () => {
    // Fixture scenario: the retired wire carried a single `major` field, but the current handler signature is
    // (major, minor). The param override deserializes that one-field wire and reshapes it into the modern arg tuple,
    // defaulting the `minor` the old bytecode never sent.
    const DEFAULTED_MINOR = 0;

    let handlerArgs: unknown[] | undefined;
    const handler = {
      isMisc: true,
      assertCompatibleOracleVersion: (...args: unknown[]) => {
        handlerArgs = args;
      },
    } as Handler;

    const legacyRegistry: Record<string, LegacyOracleEntry> = {
      aztec_misc_legacyParams: {
        modernOracle: 'aztec_misc_assertCompatibleOracleVersion',
        params: {
          legacyType: [{ name: 'major', type: U32 }],
          mapping: ([major]: number[]) => [major, DEFAULTED_MINOR],
        },
      },
    };

    const callback = buildACIRCallback(handler, { legacy: legacyRegistry });

    // Old bytecode sends one field (major = 5); the handler must still receive the full (major, minor) tuple.
    await callback['aztec_misc_legacyParams']([toACVMField(new Fr(5))]);

    expect(handlerArgs).toEqual([5, DEFAULTED_MINOR]);
  });

  it('awaits an async param mapping before invoking the modern handler', async () => {
    let handlerArgs: unknown[] | undefined;
    const handler = {
      isMisc: true,
      assertCompatibleOracleVersion: (...args: unknown[]) => {
        handlerArgs = args;
      },
    } as Handler;

    const legacyRegistry: Record<string, LegacyOracleEntry> = {
      aztec_misc_legacyAsyncParams: {
        modernOracle: 'aztec_misc_assertCompatibleOracleVersion',
        params: {
          legacyType: [{ name: 'major', type: U32 }],
          mapping: ([major]: number[]) => Promise.resolve([major + 1, 0]),
        },
      },
    };

    const callback = buildACIRCallback(handler, { legacy: legacyRegistry });

    await callback['aztec_misc_legacyAsyncParams']([toACVMField(new Fr(5))]);

    expect(handlerArgs).toEqual([6, 0]);
  });

  it('adapts the retired getL1ToL2MembershipWitness wire into the modern (messageHash, nullifier) args', async () => {
    // The retired oracle passed (contractAddress, messageHash, secret), the modern one takes the unsiloed nullifier
    // plus the address to silo it with. The adapter must derive exactly the fee juice nullifier so already-deployed
    // contracts keep working.
    const contractAddress = await AztecAddress.random();
    const messageHash = Fr.random();
    const secret = Fr.random();

    const entry = LEGACY_ORACLE_REGISTRY['aztec_utl_getL1ToL2MembershipWitness'];
    const [mappedMessageHash, mappedNullifier] = await entry.params!.mapping([contractAddress, messageHash, secret]);

    expect(mappedMessageHash).toEqual(messageHash);
    expect(mappedNullifier).toEqual(
      Option.some({ contractAddress, nullifier: await computeFeeJuiceMessageNullifier(messageHash, secret) }),
    );
  });

  it('serves the retired single-nullifier existence check from the batch status oracle', async () => {
    const service = new EphemeralArrayService();
    const existing = Fr.random();
    const handler = {
      isUtility: true,
      getNullifierStatuses: (innerNullifiers: EphemeralArray<Fr>) =>
        Promise.resolve(
          EphemeralArray.fromValues(
            service,
            innerNullifiers
              .readAll(service)
              .map(innerNullifier => ({ exists: innerNullifier.equals(existing), originBlock: Option.none() })),
          ),
        ),
    } as unknown as Handler;

    const callback = buildACIRCallback(handler);

    expect(await callback['aztec_utl_doesNullifierExist']([toACVMField(existing)])).toEqual([toACVMField(new Fr(1))]);
    expect(await callback['aztec_utl_doesNullifierExist']([toACVMField(Fr.random())])).toEqual([
      toACVMField(new Fr(0)),
    ]);
  });

  describe('retired fact oracles', () => {
    const service = new EphemeralArrayService();
    const contract = AztecAddress.fromBigIntUnsafe(100n);
    const account = AztecAddress.fromBigIntUnsafe(1n);
    const typeId = new Fr(7n);
    const collectionId = new Fr(42n);

    const collectionUnder = (scope: FactScope): FactCollection => ({
      contractAddress: contract,
      scope,
      factCollectionTypeId: typeId,
      factCollectionId: collectionId,
      facts: EphemeralArray.fromValues<Fact>(service, []),
    });

    it('passes the bare account address of the old wire to the modern handler as an account scope', async () => {
      let handlerArgs: unknown[] | undefined;
      const handler = {
        isUtility: true,
        deleteFactCollectionV2: (...args: unknown[]) => {
          handlerArgs = args;
          return Promise.resolve();
        },
      } as unknown as Handler;

      await buildACIRCallback(handler)['aztec_utl_deleteFactCollection'](
        ...[contract.toField(), account.toField(), typeId, collectionId].map(field => [toACVMField(field)]),
      );

      expect(handlerArgs).toEqual([contract, { type: 'account', account }, typeId, collectionId]);
    });

    it('passes the old recordFact wire to the modern handler with an account scope and its other args intact', async () => {
      let handlerArgs: unknown[] | undefined;
      const handler = {
        isUtility: true,
        recordFactV2: (...args: unknown[]) => {
          handlerArgs = args;
          return Promise.resolve();
        },
      } as unknown as Handler;
      const factTypeId = new Fr(3n);
      const payload = [new Fr(9n), new Fr(10n)];
      const payloadSlot = service.newArray(payload.map(field => [field]));
      const originBlock = { blockNumber: 12, blockHash: new Fr(0xabcn) };

      await buildACIRCallback(handler)['aztec_utl_recordFact'](
        ...[
          contract.toField(),
          account.toField(),
          typeId,
          collectionId,
          factTypeId,
          payloadSlot,
          // Some, then the origin block's number and hash.
          Fr.ONE,
          new Fr(originBlock.blockNumber),
          originBlock.blockHash,
        ].map(field => [toACVMField(field)]),
      );

      expect(handlerArgs).toHaveLength(7);
      const [payloadArg, originBlockArg] = handlerArgs!.slice(5);
      expect(handlerArgs!.slice(0, 5)).toEqual([
        contract,
        { type: 'account', account },
        typeId,
        collectionId,
        factTypeId,
      ]);
      expect((payloadArg as EphemeralArray<Fr>).readAll(service)).toEqual(payload);
      expect(originBlockArg).toEqual(Option.some(originBlock));
    });

    it('returns a collection scope as the bare account address of the old wire', async () => {
      const handler = {
        isUtility: true,
        getFactCollectionV2: () => Promise.resolve(Option.some(collectionUnder({ type: 'account', account }))),
      } as unknown as Handler;

      const wire = await buildACIRCallback(handler)['aztec_utl_getFactCollection'](
        ...[contract.toField(), account.toField(), typeId, collectionId].map(field => [toACVMField(field)]),
      );

      // Some, contract, scope, type, id, and the facts array slot.
      expect(wire).toHaveLength(6);
      expect(wire.slice(0, 5)).toEqual(
        [new Fr(1), contract.toField(), account.toField(), typeId, collectionId].map(toACVMField),
      );
    });

    it('refuses to return a public scope through the old wire', async () => {
      const handler = {
        isUtility: true,
        getFactCollectionsByTypeV2: () =>
          Promise.resolve(EphemeralArray.fromValues(service, [collectionUnder({ type: 'public' })])),
      } as unknown as Handler;

      await expect(
        buildACIRCallback(handler)['aztec_utl_getFactCollectionsByType'](
          ...[contract.toField(), account.toField(), typeId].map(field => [toACVMField(field)]),
        ),
      ).rejects.toThrow('cannot return a public fact scope');
    });
  });

  it('rejects a legacy name that collides with a live oracle', () => {
    const handler = { isMisc: true, getRandomField: () => Promise.resolve(new Fr(0)) } as Handler;
    const legacyRegistry: Record<string, LegacyOracleEntry> = {
      aztec_misc_getRandomField: {
        modernOracle: 'aztec_misc_getRandomField',
        returnType: { legacyType: FIELD, mapping: (result: Fr) => result },
      },
    };

    expect(() => buildACIRCallback(handler, { legacy: legacyRegistry })).toThrow('collides with a live oracle');
  });
});
