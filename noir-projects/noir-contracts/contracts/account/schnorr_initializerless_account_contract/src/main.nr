use aztec::{
    macros::{aztec, AztecConfig},
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler},
        processing::offchain::OffchainInboxSync,
    },
    protocol::address::AztecAddress,
};

/// Empty override to opt-out of state syncing. This contract does not hold private state,
/// so runnning the sync process just results in unnecessary RPC calls
unconstrained fn no_sync(
    _contract_address: AztecAddress,
    _compute_note_hash: ComputeNoteHash,
    _compute_note_nullifier: ComputeNoteNullifier,
    _process_custom_message: Option<CustomMessageHandler>,
    _offchain_inbox_sync: Option<OffchainInboxSync>,
    _scope: AztecAddress,
) {}

#[aztec(AztecConfig::new().custom_sync_state(crate::no_sync))]
pub contract SchnorrInitializerlessAccount {
    use aztec::{
        authwit::{account::AccountActions, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::functions::{allow_phase_change, external, view},
        oracle::{auth_witness::get_auth_witness, capsules::{load, store}, get_contract_instance::get_contract_instance},
        protocol::{hash::{poseidon2_hash, poseidon2_hash_bytes}, traits::{Deserialize, Serialize}},
    };
    use std::embedded_curve_ops::EmbeddedCurvePoint;

    global PUB_KEY_SLOT: Field = comptime { poseidon2_hash_bytes("INITIALIZERLESS_ACCOUNT_PUB_KEY".as_bytes()) };

    #[external("utility")]
    unconstrained fn constructor(signing_pub_key_x: Field, signing_pub_key_y: Field) {
        let expected = poseidon2_hash([signing_pub_key_x, signing_pub_key_y]);
        let instance = aztec::oracle::get_contract_instance::get_contract_instance(self.address);
        assert_eq(
            expected,
            instance.immutables_hash,
            "Public key hash does not match the immutables hash, refusing to store",
        );

        store(
            self.address,
            PUB_KEY_SLOT,
            [signing_pub_key_x, signing_pub_key_y],
            self.address,
        );
    }

    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
    }

    #[external("private")]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Safety: The public key inside the capsule is checked to match the immutables_hash of this instance
        let public_key = unsafe { load(context.this_address(), PUB_KEY_SLOT, context.this_address()) }
            .map(|data| EmbeddedCurvePoint::deserialize(data))
            .unwrap_or_else(|| panic(
                "Public key was not stored in this PXE. Please call `constructor` first",
            ));

        let expected = poseidon2_hash(public_key.serialize());
        let instance = get_contract_instance(context.this_address());

        assert_eq(expected, instance.immutables_hash, "Immutables do not match instance immutables_hash");

        // Safety: The witness is only used as a "magical value" that makes the
        // signature verification below pass.
        let limbs: [Field; 4] = unsafe { get_auth_witness(outer_hash) };
        let signature = (
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[0], limbs[1]),
            std::embedded_curve_ops::EmbeddedCurveScalar::new(limbs[2], limbs[3]),
        );

        schnorr::verify_signature(public_key, signature, outer_hash)
    }
}
