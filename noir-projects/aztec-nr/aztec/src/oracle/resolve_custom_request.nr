//! A generic, hook-backed request resolved outside the circuit. See [`resolve_custom_request`].

/// Resolves a custom, caller-defined request outside the circuit.
///
/// Unlike the protocol's built-in oracles, this one carries no fixed meaning: the contract chooses a `kind` and an
/// opaque `payload`, and PXE (or a resolver it is configured with) produces the response however it needs to, whether
/// from local state, by coordinating with a third party, or by fetching offchain data. `kind` selects the request type
/// so a single resolver can serve many such types; everything specific to a request goes in `payload`.
pub unconstrained fn resolve_custom_request<let M: u32, let N: u32>(kind: Field, payload: [Field; M]) -> [Field; N] {
    resolve_custom_request_oracle(kind, payload)
}

#[oracle(aztec_prv_resolveCustomRequest)]
unconstrained fn resolve_custom_request_oracle<let M: u32, let N: u32>(
    _kind: Field,
    _payload: [Field; M],
) -> [Field; N] {}
