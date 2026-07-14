import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { ResolveCustomRequest } from '@aztec/pxe/config';
import type { TaggingSecretSource } from '@aztec/pxe/server';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import { signInteractiveHandshake } from './signing.js';
import {
  type InteractiveHandshakeCustomRequest,
  type RecipientSignature,
  parseInteractiveHandshakeRequest,
  recipientSignatureToFields,
} from './wire.js';

/**
 * Carries an interactive-handshake signature request from the sender's wallet to the recipient's and the signed
 * authorization back. The channel is entirely wallet-chosen: an in-process call, a QR code pair, a copy-pasted blob
 * over any messenger. It passes the full request envelope, which the recipient validates independently; see
 * {@link InteractiveHandshakeCustomRequest}.
 */
export type InteractiveHandshakeTransport = (request: InteractiveHandshakeCustomRequest) => Promise<RecipientSignature>;

/** A handshake channel's recoverable identity: the raw inputs from which PXE re-derives its scanning secret. */
export type InteractiveHandshakeBackupEntry = {
  /** The account that authorized the handshake. */
  recipient: AztecAddress;
  /** The x-coordinate of the handshake's ephemeral public key. */
  ephPkX: Fr;
};

/**
 * Durable store for interactive-handshake backup entries. Interactive handshakes are the one piece of PXE state that
 * cannot be rebuilt from the chain plus account keys: losing this copy orphans the channel on reinstall. Implementers
 * must back it with a store that survives PXE wipes; the responder releases the recipient's signature only after
 * `store` resolves.
 */
export interface InteractiveHandshakeBackup {
  /**
   * Durably persists a handshake backup entry. Idempotent for the same entry.
   * @param entry - The handshake identity to persist.
   */
  store(entry: InteractiveHandshakeBackupEntry): Promise<void>;
}

/** The handshake variant of PXE's {@link TaggingSecretSource}. */
type HandshakeTaggingSecretSource = Extract<
  TaggingSecretSource,
  {
    /** Discriminates the handshake variant. */
    kind: 'handshake';
  }
>;

/**
 * The PXE surface the interactive-handshake responder needs. `PXE` satisfies it as-is; tests and wallets that wrap
 * their PXE can supply any structurally matching object.
 */
export type InteractiveHandshakeResponderPXE = {
  /** Registers the handshake as a tagging secret source so scanning discovers the channel's messages. */
  registerTaggingSecretSource(source: HandshakeTaggingSecretSource): Promise<void>;
  /** Returns the accounts registered on the PXE, used to resolve the recipient's complete address. */
  getRegisteredAccounts(): Promise<CompleteAddress[]>;
};

/**
 * Builds the sender-side `resolveCustomRequest` hook for interactive handshakes: it validates the registry's
 * signature request, forwards it over the given transport, and returns the recipient's signed authorization in the
 * field layout the registry verifies in-circuit.
 *
 * The hook rejects requests that are not interactive-handshake requests from the standard HandshakeRegistry, before
 * anything crosses the transport. A wallet serving several custom-request types should dispatch on `kind` itself and
 * delegate handshake requests here.
 */
export function createInteractiveHandshakeResolver(transport: InteractiveHandshakeTransport): ResolveCustomRequest {
  return async request => {
    parseInteractiveHandshakeRequest(request);
    const recipientSignature = await transport(request);
    return recipientSignatureToFields(recipientSignature);
  };
}

/**
 * Builds the recipient-side endpoint of an interactive handshake. The returned function is itself a valid
 * {@link InteractiveHandshakeTransport}, so in-process wiring is simply
 * `createInteractiveHandshakeResolver(createInteractiveHandshakeResponder({ ... }))`; over a real channel, the
 * transport carries the request to wherever this responder runs.
 *
 * For each valid request the responder, in order: registers the handshake with the recipient's PXE (which also
 * validates the ephemeral key is a curve point, before anything is persisted), writes the backup entry, and only
 * then signs. A failure at any step means no signature and therefore no channel; a leftover PXE source without a
 * signature is inert.
 */
export function createInteractiveHandshakeResponder(opts: {
  /** The recipient's PXE (or any structurally matching wrapper). */
  pxe: InteractiveHandshakeResponderPXE;
  /**
   * Returns the master message-signing secret key for the given account. Called per request, so multi-account
   * wallets resolve the key for whichever account the request targets. The key deliberately never touches PXE.
   */
  getSigningKey: (recipient: AztecAddress) => Promise<GrumpkinScalar>;
  /** Durable backup the channel's recoverable identity is written to before the signature is released. */
  backup: InteractiveHandshakeBackup;
}): InteractiveHandshakeTransport {
  const { pxe, getSigningKey, backup } = opts;
  return async request => {
    const parsed = parseInteractiveHandshakeRequest(request);

    const accounts = await pxe.getRegisteredAccounts();
    const completeAddress = accounts.find(account => account.address.equals(parsed.recipient));
    if (!completeAddress) {
      throw new Error(
        `Cannot authorize an interactive handshake for ${parsed.recipient}: account not held by this wallet`,
      );
    }

    await pxe.registerTaggingSecretSource({ kind: 'handshake', recipient: parsed.recipient, ephPk: parsed.ephPkX });
    await backup.store({ recipient: parsed.recipient, ephPkX: parsed.ephPkX });

    const masterMessageSigningSecretKey = await getSigningKey(parsed.recipient);
    return signInteractiveHandshake(parsed, completeAddress, masterMessageSigningSecretKey);
  };
}
