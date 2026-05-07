use crate::protocol::point::Point;

#[oracle(aztec_utl_storeHandshakeSecret)]
unconstrained fn store_handshake_secret_oracle(_master_shared_secret: Point) {}

#[oracle(aztec_utl_getHandshakeSecret)]
unconstrained fn get_handshake_secret_oracle(_secret_hash: Field) -> Option<Point> {}

/// Persists the master shared secret `S` produced by a handshake.
///
/// Storage is keyed by `secret_hash = poseidon2_hash_with_separator([S.x, S.y], DOM_SEP__HANDSHAKE_SECRET_HASH)`,
/// matching the construction in [`HandshakeNote`](crate::protocol::constants::DOM_SEP__HANDSHAKE_SECRET_HASH). PXE
/// computes the hash itself, so callers only need to supply the raw secret. Subsequent calls to
/// [`get_handshake_secret`] using the corresponding `secret_hash` will return `Some(S)` from the same PXE.
///
/// The master `S` is never returned to a calling private circuit; only the kernel reads it as a hint when
/// processing a shared secret validation request. Storing the same secret twice is idempotent.
///
/// ## Access Patterns
/// Available from both `#[external("private")]` and `#[external("utility")]` functions.
pub unconstrained fn store_handshake_secret(master_shared_secret: Point) {
    store_handshake_secret_oracle(master_shared_secret);
}

/// Returns the master shared secret previously persisted under `secret_hash`, or `None` if PXE has no record of it.
///
/// Intended to drive the kernel hint for the handshake-secret validation request: the kernel re-derives `secret_hash`
/// from the returned point and constrains the binding. The returned value is **unconstrained** at this layer; callers
/// inside a private circuit must constrain it via the kernel validation request rather than relying on it directly.
pub unconstrained fn get_handshake_secret(secret_hash: Field) -> Option<Point> {
    get_handshake_secret_oracle(secret_hash)
}
