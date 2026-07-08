import { DomainSeparator } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';

import { AztecAddress } from '../aztec-address/index.js';
import { CompleteAddress } from '../contract/complete_address.js';
import { computeLogTag, computeSiloedPrivateLogFirstField } from '../hash/hash.js';
import { deriveMasterIncomingViewingSecretKey } from '../keys/derivation.js';
import { randomAppTaggingSecret } from '../tests/factories.js';
import { AppTaggingSecret, computeSharedTaggingSecret } from './app_tagging_secret.js';
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

  describe('computeDirectional', () => {
    it('is a deterministic function of the point, app and recipient', async () => {
      const point = await Point.random();
      const app = await AztecAddress.random();
      const recipient = await AztecAddress.random();

      const a = await AppTaggingSecret.computeDirectional(point, app, recipient);
      const b = await AppTaggingSecret.computeDirectional(point, app, recipient);
      expect(b.secret).toEqual(a.secret);

      const otherApp = await AppTaggingSecret.computeDirectional(point, await AztecAddress.random(), recipient);
      expect(otherApp.secret).not.toEqual(a.secret);

      const otherRecipient = await AppTaggingSecret.computeDirectional(point, app, await AztecAddress.random());
      expect(otherRecipient.secret).not.toEqual(a.secret);
    });

    // Registering a pre-shared tagging secret point directly must yield the same directional secret as the ECDH-derived
    // sender path. Both sides of the Diffie-Hellman exchange compute the same shared point, so a recipient that
    // registers that point discovers exactly the tags a sender would emit.
    it('a directly registered shared point matches the ECDH-derived sender secret', async () => {
      const recipientSecretKey = Fr.random();
      const recipientComplete = await CompleteAddress.fromSecretKeyAndPartialAddress(recipientSecretKey, Fr.random());
      const recipientIvsk = deriveMasterIncomingViewingSecretKey(recipientSecretKey);

      const senderSecretKey = Fr.random();
      const senderComplete = await CompleteAddress.fromSecretKeyAndPartialAddress(senderSecretKey, Fr.random());
      const senderIvsk = deriveMasterIncomingViewingSecretKey(senderSecretKey);

      const app = await AztecAddress.random();

      // The recipient derives the shared point against the sender.
      const pointFromRecipient = await computeSharedTaggingSecret(
        recipientComplete,
        recipientIvsk,
        senderComplete.address,
      );
      // The sender derives the same point against the recipient (Diffie-Hellman symmetry).
      const pointFromSender = await computeSharedTaggingSecret(senderComplete, senderIvsk, recipientComplete.address);

      expect(pointFromRecipient).toBeDefined();
      expect(pointFromSender).toEqual(pointFromRecipient);

      const secretViaEcdh = await AppTaggingSecret.computeDirectional(
        pointFromRecipient!,
        app,
        recipientComplete.address,
      );
      // Registering the shared point directly (bypassing ECDH) derives the identical secret.
      const secretViaRegistration = await AppTaggingSecret.computeDirectional(
        pointFromSender!,
        app,
        recipientComplete.address,
      );

      expect(secretViaRegistration.secret).toEqual(secretViaEcdh.secret);
      expect(secretViaRegistration.app).toEqual(app);
    });
  });

  describe('fromString', () => {
    it('round-trips an unconstrained secret', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.UNCONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
      // Unconstrained secrets emit the same kind-prefixed format as constrained ones; there is no longer a
      // legacy two-part form.
      expect(original.toString()).toBe(
        `${AppTaggingSecretKind.UNCONSTRAINED}:${original.secret.toString()}:${original.app.toString()}`,
      );
    });

    it('round-trips a constrained secret', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const parsed = AppTaggingSecret.fromString(original.toString());

      expect(parsed).toBeInstanceOf(AppTaggingSecret);
      expect(parsed.kind).toBe(AppTaggingSecretKind.CONSTRAINED);
      expect(parsed.toString()).toBe(original.toString());
    });

    it('rejects the legacy two-part format', async () => {
      const original = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

      expect(() => AppTaggingSecret.fromString(`${original.secret.toString()}:${original.app.toString()}`)).toThrow(
        /Invalid AppTaggingSecret string/,
      );
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
