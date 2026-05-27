import { DomainSeparator } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeLogTag, computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { randomAppTaggingSecret, randomConstrainedAppTaggingSecret } from '../tests/factories.js';
import { AppTaggingSecret, messageLogTagDomainSeparatorFor, siloedTagFor } from './app_tagging_secret.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { TaggingIndexRangeSchema } from './tagging_index_range.js';

describe('AppTaggingSecret', () => {
  describe('kind discriminator', () => {
    it('defaults to unconstrained', async () => {
      const secret = await randomAppTaggingSecret();
      expect(secret.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
    });

    it('supports constrained secrets', async () => {
      const secret = await randomConstrainedAppTaggingSecret();
      expect(secret.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
    });
  });

  describe('messageLogTagDomainSeparatorFor', () => {
    it('returns CONSTRAINED_MSG_LOG_TAG for constrained secrets', async () => {
      const secret = await randomConstrainedAppTaggingSecret();
      expect(messageLogTagDomainSeparatorFor(secret)).toBe(DomainSeparator.CONSTRAINED_MSG_LOG_TAG);
    });

    it('returns UNCONSTRAINED_MSG_LOG_TAG for unconstrained secrets', async () => {
      const secret = await randomAppTaggingSecret();
      expect(messageLogTagDomainSeparatorFor(secret)).toBe(DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG);
    });
  });

  describe('TaggingIndexRangeSchema', () => {
    it('preserves constrained secret kind when parsing a TaggingIndexRange', async () => {
      const original = await randomConstrainedAppTaggingSecret();

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
      const original = await randomAppTaggingSecret();

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
      const original = await randomAppTaggingSecret();
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('round-trips a constrained secret', async () => {
      const original = await randomConstrainedAppTaggingSecret();
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('parses kind-prefixed unconstrained secrets', async () => {
      const original = await randomAppTaggingSecret();
      const parsed = AppTaggingSecret.fromString(
        `${AppTaggingSecretKind.UNCONSTRAINED}:${original.secret.toString()}:${original.app.toString()}`,
      );

      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('parses legacy constrained c-prefixed secrets', async () => {
      const original = await randomConstrainedAppTaggingSecret();
      const parsed = AppTaggingSecret.fromString(`c:${original.secret.toString()}:${original.app.toString()}`);

      expect(parsed.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });
  });

  describe('siloedTagFor', () => {
    it('matches the manual constrained-tag formula for a constrained secret', async () => {
      const secret = await randomConstrainedAppTaggingSecret();
      const index = 7;

      const computed = await siloedTagFor(secret, index);

      const expectedInner = await poseidon2Hash([secret.secret, new Fr(index)]);
      const expectedLogTag = await computeLogTag(expectedInner, DomainSeparator.CONSTRAINED_MSG_LOG_TAG);
      const expectedSiloed = await computeSiloedPrivateLogFirstField(secret.app, expectedLogTag);

      expect(computed.value.toString()).toEqual(expectedSiloed.toString());
    });

    it('matches the unconstrained-tag formula for an unconstrained secret', async () => {
      const secret = await randomAppTaggingSecret();
      const index = 7;

      const computed = await siloedTagFor(secret, index);

      const expectedInner = await poseidon2Hash([secret.secret, new Fr(index)]);
      const expectedLogTag = await computeLogTag(expectedInner, DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG);
      const expectedSiloed = await computeSiloedPrivateLogFirstField(secret.app, expectedLogTag);

      expect(computed.value.toString()).toEqual(expectedSiloed.toString());
    });

    it('produces different tags for the two flavors even when the underlying Fr matches', async () => {
      const constrained = await randomConstrainedAppTaggingSecret();
      const unconstrained = new AppTaggingSecret(constrained.secret, constrained.app);

      const unconstrainedTag = await siloedTagFor(unconstrained, 0);
      const constrainedTag = await siloedTagFor(constrained, 0);

      expect(unconstrainedTag.value.toString()).not.toEqual(constrainedTag.value.toString());
    });
  });
});
