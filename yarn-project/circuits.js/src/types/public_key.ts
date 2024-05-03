import { type Point } from '@aztec/foundation/fields';

/** Represents a user public key. */
export type PublicKey = Point;

export type PublicKeys = {
  masterNullifierPublicKey: Point,
  masterIncomingViewingPublicKey: Point,
  masterOutgoingViewingPublicKey: Point,
  masterTaggingPublicKey: Point,
}
