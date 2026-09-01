/* eslint-disable camelcase */
import { Fr } from '@aztec/foundation/curves/bn254';
import { toACVMField } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeFeeJuiceMessageNullifier } from '@aztec/stdlib/messaging';

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
    const privateContent = [secret];

    const entry = LEGACY_ORACLE_REGISTRY['aztec_utl_getL1ToL2MembershipWitness'];
    const [mappedMessageHash, mappedNullifier] = await entry.params!.mapping([contractAddress, messageHash, secret]);

    expect(mappedMessageHash).toEqual(messageHash);
    expect(mappedNullifier).toEqual(
      Option.some({ contractAddress, nullifier: await computeFeeJuiceMessageNullifier(messageHash, privateContent) }),
    );
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
