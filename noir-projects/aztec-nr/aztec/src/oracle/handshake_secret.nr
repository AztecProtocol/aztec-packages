use crate::protocol::point::Point;

#[oracle(aztec_utl_storeHandshakeSecret)]
unconstrained fn store_handshake_secret_oracle(_master_shared_secret: Point) {}

/// Persists the master shared secret `S` produced by a handshake.
///
/// Storage is keyed by `secret_hash = poseidon2_hash_with_separator([S.x, S.y], DOM_SEP__HANDSHAKE_SECRET_HASH)`,
/// matching the construction in [`HandshakeNote`](crate::protocol::constants::DOM_SEP__HANDSHAKE_SECRET_HASH). PXE
/// computes the hash itself, so callers only need to supply the raw secret.
///
/// The master `S` is never returned to a calling circuit. There is intentionally no contract-callable readback
/// path today: see the TODO below.
///
/// ## Access Patterns
/// Available from both `#[external("private")]` and `#[external("utility")]` functions.
///
/// TODO: wire the lookup as a kernel-only hint that validates the `secret_hash -> S` binding and returns only an
/// app-siloed value to contract code. Until that lands this oracle only writes; exposing the raw `S` to contract
/// code lets a malicious app derive app-siloed secrets for any other contract once it learns a `secret_hash`.
pub unconstrained fn store_handshake_secret(master_shared_secret: Point) {
    store_handshake_secret_oracle(master_shared_secret);
}
