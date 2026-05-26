import { DomainSeparator } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';

import { computeLogTag, computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { randomConstrainedAppTaggingSecret, randomExtendedDirectionalAppTaggingSecret } from '../tests/factories.js';
import { appTaggingSecretFromString, messageLogTagDomainSeparatorFor, siloedTagFor } from './app_tagging_secret.js';
import { AppTaggingSecretKind } from './app_tagging_secret_kind.js';
import { ConstrainedAppTaggingSecret } from './constrained_app_tagging_secret.js';
import { ExtendedDirectionalAppTaggingSecret } from './extended_directional_app_tagging_secret.js';
import { TaggingIndexRangeSchema } from './tagging_index_range.js';

describe('AppTaggingSecret helpers', () => {
  describe('kind discriminator', () => {
    it('exposes kind on ExtendedDirectionalAppTaggingSecret instances', async () => {
      const secret = await randomExtendedDirectionalAppTaggingSecret();
      expect(secret.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
    });

    it('exposes kind on ConstrainedAppTaggingSecret instances', async () => {
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
      const secret = await randomExtendedDirectionalAppTaggingSecret();
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

      expect(parsed.extendedSecret).toBeInstanceOf(ConstrainedAppTaggingSecret);
      expect(parsed.extendedSecret.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
    });

    it('preserves unconstrained secret kind when parsing a TaggingIndexRange', async () => {
      const original = await randomExtendedDirectionalAppTaggingSecret();

      const parsed = TaggingIndexRangeSchema.parse({
        extendedSecret: {
          kind: AppTaggingSecretKind.UNCONSTRAINED,
          secret: original.secret.toString(),
          app: original.app.toString(),
        },
        lowestIndex: 0,
        highestIndex: 3,
      });

      expect(parsed.extendedSecret).toBeInstanceOf(ExtendedDirectionalAppTaggingSecret);
      expect(parsed.extendedSecret.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
    });
  });

  describe('appTaggingSecretFromString', () => {
    it('round-trips an unconstrained secret', async () => {
      const original = await randomExtendedDirectionalAppTaggingSecret();
      const parsed = appTaggingSecretFromString(original.toString());

      expect(parsed).toBeInstanceOf(ExtendedDirectionalAppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('round-trips a constrained secret', async () => {
      const original = await randomConstrainedAppTaggingSecret();
      const parsed = appTaggingSecretFromString(original.toString());

      expect(parsed).toBeInstanceOf(ConstrainedAppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('distinguishes the two shapes by the c: prefix', async () => {
      const unconstrained = await randomExtendedDirectionalAppTaggingSecret();
      const constrained = await randomConstrainedAppTaggingSecret();

      expect(unconstrained.toString().startsWith('c:')).toBe(false);
      expect(constrained.toString().startsWith('c:')).toBe(true);
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

    it('matches the unconstrained-tag formula for an extended-directional secret', async () => {
      const secret = await randomExtendedDirectionalAppTaggingSecret();
      const index = 7;

      const computed = await siloedTagFor(secret, index);

      const expectedInner = await poseidon2Hash([secret.secret, new Fr(index)]);
      const expectedLogTag = await computeLogTag(expectedInner, DomainSeparator.UNCONSTRAINED_MSG_LOG_TAG);
      const expectedSiloed = await computeSiloedPrivateLogFirstField(secret.app, expectedLogTag);

      expect(computed.value.toString()).toEqual(expectedSiloed.toString());
    });

    it('produces different tags for the two flavors even when the underlying Fr matches', async () => {
      const sharedFr = Fr.random();
      const constrained = await randomConstrainedAppTaggingSecret();
      // Reconstruct the unconstrained twin with the same `.secret` and `.app` as the constrained one.
      const unconstrained = ExtendedDirectionalAppTaggingSecret.fromString(
        `${sharedFr.toString()}:${constrained.app.toString()}`,
      );
      const constrainedTwin = new ConstrainedAppTaggingSecret(sharedFr, constrained.app);

      const unconstrainedTag = await siloedTagFor(unconstrained, 0);
      const constrainedTag = await siloedTagFor(constrainedTwin, 0);

      expect(unconstrainedTag.value.toString()).not.toEqual(constrainedTag.value.toString());
    });
  });
});
