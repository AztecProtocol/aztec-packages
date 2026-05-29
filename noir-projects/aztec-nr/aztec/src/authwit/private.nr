use crate::{
    authwit::utils::{
        CallAuthorization, compute_authwit_nullifier, compute_inner_authwit_hash, emit_authorization_as_offchain_effect,
        IS_VALID_SELECTOR,
    },
    context::PrivateContext,
};
use crate::protocol::{abis::function_selector::FunctionSelector, address::AztecAddress, traits::Serialize};

/// Private-flow authwit helpers.
///
/// Say that a user `Alice` wants to deposit some tokens into a DeFi protocol (say a DEX). `Alice` would make a
/// `deposit` transaction, that she is executing using her account contract. The account would call the `DeFi`
/// contract to execute `deposit`, which would try to pull funds from the `Token` contract. Since the `DeFi` contract
/// is trying to pull funds from an account that is not its own, it needs to convince the `Token` contract that it is
/// allowed to do so.
///
/// This is where the authentication witness comes in. The `Token` contract computes a `message_hash` from the
/// `transfer` call, and then asks `Alice Account` contract to verify that the `DeFi` contract is allowed to execute
/// that call.
///
/// `Alice Account` contract can then ask `Alice` if she wants to allow the `DeFi` contract to pull funds from her
/// account. If she does, she will sign the `message_hash` and return the signature to the `Alice Account` which will
/// validate it and return success to the `Token` contract which will then allow the `DeFi` contract to pull funds
/// from `Alice`.
///
/// To ensure that the same "approval" cannot be used multiple times, we also compute a `nullifier` for the
/// authentication witness, and emit it from the `Token` contract (consumer).
///
/// Note that we can do this flow as we are in private where we can do oracle calls out from contracts.
///
///  Person          Contract              Contract               Contract
///  Alice          Alice Account          Token                   DeFi
///   |                  |                  |                      |
///   | Defi.deposit(Token, 1000)           |                      |
///   |----------------->|                  |                      |
///   |                  | deposit(Token, 1000)                    |
///   |                  |---------------------------------------->|
///   |                  |                  |                      |
///   |                  |                  | transfer(Alice, Defi, 1000)
///   |                  |                  |<---------------------|
///   |                  |                  |                      |
///   |                  | Check if Defi may call transfer(Alice, Defi, 1000)
///   |                  |<-----------------|                      |
///   |                  |                  |                      |
///   | Please give me AuthWit for DeFi     |                      |
///   | calling transfer(Alice, Defi, 1000) |                      |
///   |<-----------------|                  |                      |
///   |                  |                  |                      |
///   |                  |                  |                      |
///   | AuthWit for transfer(Alice, Defi, 1000)                    |
///   |----------------->|                  |                      |
///   |                  | AuthWit validity |                      |
///   |                  |----------------->|                      |
///   |                  |                  |                      |
///   |                  |       throw if invalid AuthWit          |
///   |                  |                  |                      |
///   |                  |       emit AuthWit nullifier            |
///   |                  |                  |                      |
///   |                  |       transfer(Alice, Defi, 1000)       |
///   |                  |                  |                      |
///   |                  |                  |                      |
///   |                  |                  | success              |
///   |                  |                  |--------------------->|
///   |                  |                  |                      |
///   |                  |                  |                      |
///   |                  |                  |           deposit(Token, 1000)
///   |                  |                  |                      |

/// Assert that `on_behalf_of` has authorized the current call with a valid authentication witness
///
/// Compute the `inner_hash` using the `msg_sender`, `selector` and `args_hash` and then make a call out to the
/// `on_behalf_of` contract to verify that the `inner_hash` is valid.
///
/// Additionally, this function emits the identifying information of the call as an offchain effect so PXE can rely the
/// information to the user/wallet in a readable way. To that effect, it is generic over N, where N is the number of
/// arguments the authorized functions takes. This is used to load the arguments from the execution cache. This
/// function is intended to be called via a macro, which will use the turbofish operator to specify the number of
/// arguments.
///
/// @param on_behalf_of The address that has allegedly authorized the current call
pub fn assert_current_call_valid_authwit<let N: u32>(context: &mut PrivateContext, on_behalf_of: AztecAddress) {
    let args_hash: Field = context.get_args_hash();

    let authorization =
        CallAuthorization { msg_sender: context.maybe_msg_sender().unwrap(), selector: context.selector(), args_hash };
    let inner_hash = compute_inner_authwit_hash(authorization.serialize());
    // Safety: Offchain effects are by definition unconstrained. They are emitted via an oracle which we don't use for
    // anything besides its side effects, therefore this is safe to call.
    unsafe { emit_authorization_as_offchain_effect::<N>(authorization, inner_hash, on_behalf_of) };

    assert_inner_hash_valid_authwit(context, on_behalf_of, inner_hash);
}

/// Assert that a specific `inner_hash` is valid for the `on_behalf_of` address
///
/// Used as an internal function for `assert_current_call_valid_authwit` and can be used as a standalone function when
/// the `inner_hash` is from a different source, e.g., say a block of text etc.
///
/// @param on_behalf_of The address that has allegedly authorized the current call @param inner_hash The hash of the
/// message to authorize
pub fn assert_inner_hash_valid_authwit(context: &mut PrivateContext, on_behalf_of: AztecAddress, inner_hash: Field) {
    // We perform a static call here and not a standard one to ensure that the account contract cannot re-enter.
    let result: Field = context
        .static_call_private_function(
            on_behalf_of,
            comptime { FunctionSelector::from_signature("verify_private_authwit(Field)") },
            [inner_hash],
        )
        .get_preimage();
    assert(result == IS_VALID_SELECTOR, "Message not authorized by account");
    // Compute the nullifier, similar computation to the outer hash, but without the chain_id and version. Those should
    // already be handled in the verification, so we just need something to nullify, that allows the same inner_hash
    // for multiple actors.
    let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
    context.push_nullifier(nullifier);
}
