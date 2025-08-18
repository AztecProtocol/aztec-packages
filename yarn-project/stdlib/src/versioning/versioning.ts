import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import type Koa from 'koa';

import type { ChainConfig } from '../config/chain-config.js';

/** Fields that identify a version of the Aztec protocol. Any mismatch between these fields should signal an incompatibility between nodes. */
export type ComponentsVersions = {
  l1ChainId: number;
  // TODO: Consider using governance address instead to support migrations.
  // Note that we are using the rollup address as identifier in multiple places
  // such as the keystore, we need to change it so we can handle updates.
  l1RollupAddress: EthAddress;
  rollupVersion: number;
  l2ProtocolContractsTreeRoot: string;
  l2CircuitsVkTreeRoot: string;
};

/** Returns components versions from chain config. */
export function getComponentsVersionsFromConfig(
  config: ChainConfig,
  l2ProtocolContractsTreeRoot: string | Fr,
  l2CircuitsVkTreeRoot: string | Fr,
): ComponentsVersions {
  return {
    l1ChainId: config.l1ChainId,
    l1RollupAddress: config.l1Contracts?.rollupAddress, // This should not be undefined, but sometimes the config lies to us and it is...
    rollupVersion: config.rollupVersion,
    l2ProtocolContractsTreeRoot: l2ProtocolContractsTreeRoot.toString(),
    l2CircuitsVkTreeRoot: l2CircuitsVkTreeRoot.toString(),
  };
}

/** Returns a compressed string representation of the version (around 32 chars). Used in p2p ENRs. */
export function compressComponentVersions(versions: ComponentsVersions): string {
  if (
    versions.l1RollupAddress === undefined ||
    versions.l2ProtocolContractsTreeRoot === undefined ||
    versions.l2CircuitsVkTreeRoot === undefined
  ) {
    throw new Error(`Component versions are not set: ${jsonStringify(versions)}`);
  }

  return [
    '00',
    versions.l1ChainId,
    versions.l1RollupAddress.toString().slice(2, 10),
    versions.rollupVersion,
    versions.l2ProtocolContractsTreeRoot.toString().slice(2, 10),
    versions.l2CircuitsVkTreeRoot.toString().slice(2, 10),
  ].join('-');
}

export class ComponentsVersionsError extends Error {
  constructor(key: string, expected: string, value: string) {
    super(`Expected component version ${key} to be ${expected} but received ${value}`);
    this.name = 'ComponentsVersionsError';
  }
}

/** Checks if the compressed string matches against the expected versions. Throws on mismatch. */
export function checkCompressedComponentVersion(compressed: string, expected: ComponentsVersions) {
  const [versionVersion, l1ChainId, l1RollupAddress, rollupVersion, l2ProtocolContractsTreeRoot, l2CircuitsVkTreeRoot] =
    compressed.split('-');
  if (versionVersion !== '00') {
    throw new ComponentsVersionsError('version', '00', versionVersion);
  }
  if (l1ChainId !== expected.l1ChainId.toString()) {
    throw new ComponentsVersionsError(`L1 chain ID`, expected.l1ChainId.toString(), l1ChainId);
  }
  if (l1RollupAddress !== expected.l1RollupAddress.toString().slice(2, 10)) {
    throw new ComponentsVersionsError(`L1 address`, expected.l1RollupAddress.toString(), l1RollupAddress);
  }
  if (rollupVersion !== expected.rollupVersion.toString()) {
    throw new ComponentsVersionsError('L2 chain version', expected.rollupVersion.toString(), rollupVersion);
  }
  if (l2ProtocolContractsTreeRoot !== expected.l2ProtocolContractsTreeRoot.toString().slice(2, 10)) {
    throw new ComponentsVersionsError(
      `L2 protocol contracts vk tree root`,
      expected.l2ProtocolContractsTreeRoot.toString(),
      l2ProtocolContractsTreeRoot,
    );
  }
  if (l2CircuitsVkTreeRoot !== expected.l2CircuitsVkTreeRoot.toString().slice(2, 10)) {
    throw new ComponentsVersionsError(
      'L2 circuits vk tree root',
      expected.l2CircuitsVkTreeRoot.toString(),
      l2CircuitsVkTreeRoot,
    );
  }
}

/** Checks that two component versions match. Undefined fields are ignored. */
export function validatePartialComponentVersionsMatch(
  expected: Partial<ComponentsVersions>,
  actual: Partial<ComponentsVersions>,
) {
  for (const key of [
    'l1RollupAddress',
    'l2ProtocolContractsTreeRoot',
    'l2CircuitsVkTreeRoot',
    'l1ChainId',
    'rollupVersion',
  ] as const) {
    const actualValue = actual[key];
    const expectedValue = expected[key];
    if (expectedValue !== undefined && actualValue !== undefined) {
      if (typeof actualValue === 'object' ? !actualValue.equals(expectedValue as any) : actualValue !== expectedValue) {
        throw new Error(`Expected ${key} to be ${expectedValue} but received ${actualValue}`);
      }
    }
  }
}

/** Returns a Koa middleware that injects the versioning info as headers. */
export function getVersioningMiddleware(versions: Partial<ComponentsVersions>) {
  return async (ctx: Koa.Context, next: () => Promise<void>) => {
    await next();
    for (const key in versions) {
      const value = versions[key as keyof ComponentsVersions];
      if (value !== undefined) {
        ctx.set(`x-aztec-${key}`, value.toString());
      }
    }
  };
}

/** Returns a json rpc client handler that rejects responses with mismatching versions. */
export function getVersioningResponseHandler(versions: Partial<ComponentsVersions>) {
  return ({ headers }: { headers: { get: (header: string) => string | null | undefined } }) => {
    for (const key in versions) {
      const value = versions[key as keyof ComponentsVersions];
      if (value !== undefined) {
        const headerValue = headers.get(`x-aztec-${key}`);
        if (headerValue !== undefined && headerValue !== null && headerValue !== value.toString()) {
          throw new ComponentsVersionsError(key, value.toString(), headerValue);
        }
      }
    }
    return Promise.resolve();
  };
}
