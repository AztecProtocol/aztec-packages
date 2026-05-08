import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

/**
 * Persists master shared secrets `S` produced by handshakes performed in a contract's private execution, keyed by
 * `secret_hash = poseidon2_hash_with_separator([S.x, S.y], DOM_SEP__HANDSHAKE_SECRET_HASH)`. The construction matches
 * `HandshakeNote::new` so consumers can look up the master `S` from the `secret_hash` stored in the corresponding note.
 *
 * The oracle interface accepts only the raw `S` and recomputes the hash here, so the keying is bound to the protocol
 * domain separator and the contract cannot influence it. The same construction is used by `HandshakeNote::new`, so the
 * note's `secret_hash` field naturally matches this store's key. Consuming contracts read `secret_hash` from the note
 * rather than recomputing it. Master secrets never leave the kernel during downstream validation: they are surfaced as
 * hints into the kernel which then enforces the binding between `secret_hash` and an app-siloed derived value.
 *
 * Writes are buffered per `jobId` and only persisted on `commit`, mirroring the staging contract used by the rest of
 * PXE's stores. A handshake performed in a reverted simulation therefore leaves no trace.
 */
export class HandshakeSecretStore implements StagedStore {
  readonly storeName = 'handshake_secret';

  #store: AztecAsyncKVStore;

  /** secret_hash -> serialized Point (3 fields: x, y, is_infinite). */
  #secrets: AztecAsyncMap<string, Buffer>;

  /** jobId -> secret_hash -> serialized Point. */
  #stagedSecrets: Map<string, Map<string, Buffer>>;

  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#secrets = this.#store.openMap('handshake_secrets');
    this.#stagedSecrets = new Map();
    this.logger = createLogger('pxe:handshake-secret-store');
  }

  /**
   * Persists `masterSharedSecret` keyed by its `secret_hash`.
   *
   * The write is staged on `jobId` and only persisted on commit.
   */
  async setHandshakeSecret(masterSharedSecret: Point, jobId: string): Promise<void> {
    const secretHash = await computeHandshakeSecretHash(masterSharedSecret);
    const secretHashKey = secretHash.toString();
    const secretBuffer = serializePoint(masterSharedSecret);

    this.logger.debug(`Staging handshake secret with hash ${secretHashKey}`, { jobId });

    this.#getJobStaged(jobId).set(secretHashKey, secretBuffer);
  }

  /**
   * Returns the master shared secret previously stored under `secretHash`, or `undefined` if none exists.
   *
   * Reads pick up writes staged on the same `jobId` even before commit, so reads are coherent with prior writes from
   * the same simulation.
   */
  getHandshakeSecret(secretHash: Fr, jobId: string): Promise<Point | undefined> {
    const secretHashKey = secretHash.toString();

    return this.#store.transactionAsync(async () => {
      // Always issue the DB read to keep the transaction alive.
      // The staged value still takes precedence if it exists.
      const dbValue = await this.#secrets.getAsync(secretHashKey);
      const stagedValue = this.#getJobStaged(jobId).get(secretHashKey);
      const buffer = stagedValue ?? dbValue;
      return buffer ? deserializePoint(buffer) : undefined;
    });
  }

  /**
   * Commits staged data to main storage.
   *
   * Called by `JobCoordinator` when a job completes successfully. `JobCoordinator` wraps all commits in a single
   * transaction, so we don't open a new one here.
   */
  async commit(jobId: string): Promise<void> {
    const staged = this.#stagedSecrets.get(jobId);
    if (!staged) {
      return;
    }
    for (const [secretHashKey, secretBuffer] of staged) {
      await this.#secrets.set(secretHashKey, secretBuffer);
    }
    this.#stagedSecrets.delete(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.#stagedSecrets.delete(jobId);
    return Promise.resolve();
  }

  #getJobStaged(jobId: string): Map<string, Buffer> {
    let staged = this.#stagedSecrets.get(jobId);
    if (!staged) {
      staged = new Map();
      this.#stagedSecrets.set(jobId, staged);
    }
    return staged;
  }
}

/**
 * Computes the storage key for a master shared secret. Mirrors the Noir construction in `HandshakeNote::new`.
 */
export function computeHandshakeSecretHash(masterSharedSecret: Point): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [masterSharedSecret.x, masterSharedSecret.y],
    DomainSeparator.HANDSHAKE_SECRET_HASH,
  );
}

function serializePoint(point: Point): Buffer {
  return serializeToBuffer([point.x, point.y, new Fr(point.isInfinite)]);
}

function deserializePoint(buffer: Buffer): Point {
  if (buffer.length !== Fr.SIZE_IN_BYTES * 3) {
    throw new Error(`Invalid handshake secret buffer length: expected ${Fr.SIZE_IN_BYTES * 3}, got ${buffer.length}`);
  }
  const x = Fr.fromBuffer(buffer.subarray(0, Fr.SIZE_IN_BYTES));
  const y = Fr.fromBuffer(buffer.subarray(Fr.SIZE_IN_BYTES, Fr.SIZE_IN_BYTES * 2));
  const isInfinite = !Fr.fromBuffer(buffer.subarray(Fr.SIZE_IN_BYTES * 2, Fr.SIZE_IN_BYTES * 3)).isZero();
  return new Point(x, y, isInfinite);
}
