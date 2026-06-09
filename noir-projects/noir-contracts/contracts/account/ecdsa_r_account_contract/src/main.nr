// Account contract that uses ECDSA signatures for authentication on random version of the p256 curve (to use with
// touchID).
use aztec::macros::aztec;

#[aztec]
pub contract EcdsaRAccount {
    use aztec::{
        authwit::{account::AccountActions, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::{functions::{allow_phase_change, external, initializer, noinitcheck, view}, storage::storage},
        messages::delivery::MessageDelivery,
        oracle::auth_witness::get_auth_witness_as_bytes,
        state_vars::SinglePrivateImmutable,
    };

    use ecdsa_public_key_note::EcdsaPublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: SinglePrivateImmutable<EcdsaPublicKeyNote, Context>,
    }

    // Creates a new account out of an ECDSA public key to use for signature verification
    #[external("private")]
    #[initializer]
    fn constructor(signing_pub_key_x: [u8; 32], signing_pub_key_y: [u8; 32]) {
        let pub_key_note = EcdsaPublicKeyNote { x: signing_pub_key_x, y: signing_pub_key_y };

        // The deployment transaction is typically sent from a separate account (e.g. a fee-paying deployer), which
        // would otherwise be used as the sender for tags. We override it with this account's own address so the
        // recipient can discover the note by registering the account address, regardless of who deployed it.
        self.storage.signing_public_key.initialize(pub_key_note).deliver(MessageDelivery::onchain_constrained()
            .with_sender(self.address));
    }

    // @dev: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts file
    // (specifically `getEntrypointAbi()`)
    // using noinitcheck is an optimization, it reduces gates by omitting a check that the contract has been initialized
    #[external("private")]
    #[noinitcheck]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
    }

    #[external("private")]
    #[noinitcheck]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Load public key from storage
        let storage = Storage::init(context);
        let public_key = storage.signing_public_key.get_note();

        // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        // Hence it's safe.
        let signature: [u8; 64] = unsafe { get_auth_witness_as_bytes(outer_hash) };

        // Verify payload signature using Ethereum's signing scheme
        // Note that noir expects the hash of the message/challenge as input to the ECDSA verification.
        let outer_hash_bytes: [u8; 32] = outer_hash.to_be_bytes();
        let hashed_message: [u8; 32] = sha256::digest(outer_hash_bytes);
        std::ecdsa_secp256r1::verify_signature(public_key.x, public_key.y, signature, hashed_message)
    }
}
