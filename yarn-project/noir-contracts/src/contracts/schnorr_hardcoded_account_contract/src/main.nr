use dep::std;
use dep::aztec::context::PrivateContext;
use dep::aztec::oracle::auth_witness::get_auth_witness;

// docs:start:contract
global public_key_x: Field = 0x0ede3d33c920df8fdf43f3e39ed38b0882c25b056620ef52fd016fe811aa2443;
global public_key_y: Field = 0x29155934ffaa105323695b5f91faadd84acc21f4a8bda2fad760f992d692bc7f;

// Declared outside the contract to work around Noir error
// "entered unreachable code: ICE: Params to the program should only contains numbers and arrays"
// docs:start:is-valid
fn is_valid_impl(_context: &mut PrivateContext, message_hash: Field) -> bool {
    // TODO: Workaround for https://github.com/noir-lang/noir/issues/2421
    let message_bytes_slice = message_hash.to_be_bytes(32);
    let mut message_bytes: [u8; 32] = [0; 32];
    for i in 0..32 { message_bytes[i] = message_bytes_slice[i]; }

    // Load auth witness
    let witness: [Field; 64] = get_auth_witness(message_hash);
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..64 { signature[i] = witness[i] as u8; }

    let verification = std::schnorr::verify_signature(public_key_x, public_key_y, signature, message_bytes);
    assert(verification == true);

    true
}
// docs:end:is-valid

// Account contract that uses Schnorr signatures for authentication using a hardcoded public key.
contract SchnorrHardcodedAccount {
    use dep::std;
    use dep::aztec::{
        entrypoint::{ EntrypointPayload, ENTRYPOINT_PAYLOAD_SIZE },
        abi::{ PrivateCircuitPublicInputs, PrivateContextInputs, Hasher },
        types::{ vec::BoundedVec, point::Point },
        constants_gen::GENERATOR_INDEX__SIGNATURE_PAYLOAD,
        context::PrivateContext,
        account::AccountActions,
    };

    use crate::is_valid_impl;

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 1;

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn entrypoint(payload: pub EntrypointPayload) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.entrypoint(payload);
    }

    #[aztec(private)]
    fn is_valid(message_hash: Field) -> Field {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid(message_hash)
    }

    #[aztec(public)]
    fn is_valid_public(message_hash: Field) -> Field {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid_public(message_hash)
    }

    #[aztec(private)]
    fn set_is_valid_storage(message_hash: Field, value: Field) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.set_is_valid_storage(message_hash, value)
    }

    #[aztec(public)]
    internal fn internal_set_is_valid_storage(message_hash: Field, value: Field) {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.internal_set_is_valid_storage(message_hash, value)
    }
}
// docs:end:contract