import { DomainSeparator } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeLogTag, computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { randomAppTaggingSecret } from '../tests/factories.js';
import { AppTaggingSecret } from './app_tagging_secret.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { SiloedTag } from './siloed_tag.js';
import { TaggingIndexRangeSchema } from './tagging_index_range.js';

describe('AppTaggingSecret', () => {
  describe('TaggingIndexRangeSchema', () => {
    it('preserves constrained secret kind when parsing a TaggingIndexRange', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      const parsed = TaggingIndexRangeSchema.parse({
        extendedSecret: {
          kind: AppTaggingSecretKind.CONSTRAINED,
          secret: original.secret.toString(),
          app: original.app.toString(),
        },
        lowestIndex: 0,
        highestIndex: 3,
      });

      expect(parsed.extendedSecret).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.extendedSecret.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
    });

    it('defaults missing secret kind to unconstrained when parsing a TaggingIndexRange', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

      const parsed = TaggingIndexRangeSchema.parse({
        extendedSecret: {
          secret: original.secret.toString(),
          app: original.app.toString(),
        },
        lowestIndex: 0,
        highestIndex: 3,
      });

      expect(parsed.extendedSecret).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.extendedSecret.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
    });
  });

  describe('fromString', () => {
    it('round-trips an unconstrained secret', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('round-trips a constrained secret', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    // TODO(F-680): Remove once unconstrained `toString()` always emits the kind-prefixed format.
    it('parses kind-prefixed unconstrained secrets', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
      const parsed = AppTaggingSecret.fromString(
        `${AppTaggingSecretKind.UNCONSTRAINED}:${original.secret.toString()}:${original.app.toString()}`,
      );

      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('rejects unknown kind prefixes', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

      expect(() =>
        AppTaggingSecret.fromString(`invalid:${original.secret.toString()}:${original.app.toString()}`),
      ).toThrow(/Invalid AppTaggingSecret kind/);
    });
  });

  describe('SiloedTag.compute', () => {
    it('matches the manual constrained-tag formula for a constrained secret', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const index = 7;

      const computed = await SiloedTag.compute({ extendedSecret: secret, index });

      const expectedInner = await poseidon2Hash([secret.secret, new Fr(index)]);
      const expectedLogTag = await computeLogTag(expectedInner, DomainSeparator.CONSTRAINED_MSG_LOG_TAG);
      const expectedSiloed = await computeSiloedPrivateLogFirstField(secret.app, expectedLogTag);

      expect(computed.value.toString()).toEqual(expectedSiloed.toString());
    });

    it('matches the unconstrained-tag formula for an unconstrained secret', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
      const index = 7;

      const computed = await SiloedTag.compute({ extendedSecret: secret, index });

      const expectedInner = await poseidon2Hash([secret.secret, new Fr(index)]);
      const expectedLogTag = await computeLogTag(expectedInner, DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG);
      const expectedSiloed = await computeSiloedPrivateLogFirstField(secret.app, expectedLogTag);

      expect(computed.value.toString()).toEqual(expectedSiloed.toString());
    });

    it('produces different tags for the two flavors even when the underlying Fr matches', async () => {
      const constrained = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const unconstrained = new AppTaggingSecret(constrained.secret, constrained.app);

      const unconstrainedTag = await SiloedTag.compute({ extendedSecret: unconstrained, index: 0 });
      const constrainedTag = await SiloedTag.compute({ extendedSecret: constrained, index: 0 });

      expect(unconstrainedTag.value.toString()).not.toEqual(constrainedTag.value.toString());
    });
  });
});
