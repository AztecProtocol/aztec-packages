//! Shared signature for the macro-injected `offchain_receive` utility.
//!
//! `offchain_receive` lives in two places: it is injected into every contract by the `#[aztec]`
//! macro (see `generate_offchain_receive` in `macros/aztec.nr`), and its interface stub is
//! generated so other contracts can call it (see `create_offchain_receive_stub` in
//! `macros/calls_generation/external_functions.nr`). Both sites must agree on the function's
//! name, parameter name, parameter type, and return type, or the selectors they compute would
//! diverge and runtime calls would fail silently.
//!
//! To keep them in lockstep, both sites pull the signature components from here.

/// Name of the injected utility function.
pub(crate) comptime global OFFCHAIN_RECEIVE_FN_NAME: Quoted = quote { offchain_receive };

/// Name of the single parameter.
pub(crate) comptime global OFFCHAIN_RECEIVE_PARAM_NAME: Quoted = quote { messages };

/// Return type of the function.
pub(crate) comptime global OFFCHAIN_RECEIVE_RETURN_TYPE: Quoted = quote { () };

/// The parameter type `BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL>`.
pub(crate) comptime fn offchain_receive_param_type(prefix: Quoted) -> Quoted {
    quote {
        BoundedVec<
            $prefix::messages::processing::offchain::OffchainMessage,
            $prefix::messages::processing::offchain::MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL,
        >
    }
}
