use super::schnorr::Signature;
use aztec::{
    context::PrivateContext,
    keys::getters::{get_nhk_app, get_public_keys, try_get_public_keys},
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    oracle::capsules,
    protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_NULLIFIER},
        hash::{poseidon2_hash, poseidon2_hash_with_separator, sha256_to_field},
        traits::{Deserialize, Hash, Packable, Serialize, ToField},
    },
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[custom_note]
pub struct AssertedNote {
    pub amount: u128,
    pub randomness: Field,
    pub signature: Signature,
}

impl NoteHash for AssertedNote {
    fn compute_note_hash(
        self,
        owner: AztecAddress,
        storage_slot: Field,
        _randomness: Field, // Aztec_nr randomness: unused
    ) -> Field {
        poseidon2_hash_with_separator(
            [self.amount as Field, owner.to_field(), storage_slot, self.randomness],
            DOM_SEP__NOTE_HASH,
        )
    }

    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Field {
        let owner_npk_m = get_public_keys(owner).npk_m;
        let owner_npk_m_hash = owner_npk_m.hash();
        let secret = context.request_nhk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullification, secret],
            DOM_SEP__NOTE_NULLIFIER,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(
        self,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Option<Field> {
        try_get_public_keys(owner).map(|public_keys| {
            let owner_npk_m = public_keys.npk_m;
            let owner_npk_m_hash = owner_npk_m.hash();
            let secret = get_nhk_app(owner_npk_m_hash);
            poseidon2_hash_with_separator(
                [note_hash_for_nullification, secret],
                DOM_SEP__NOTE_NULLIFIER,
            )
        })
    }
}

impl AssertedNote {
    pub fn create(context: &mut PrivateContext, amount: u128) -> Self {
        // Careful! we can't create another note before inserting the previous! or it'd repeat randomness.
        // Safety: Randomness is really just a prover chosen value.
        let randomness =
            unsafe { load_randomness(context.this_address(), context.side_effect_counter) };

        // Safety: The signature is verified on reception. We can't verify it on send by design.
        let signature = unsafe { load_signature(context.this_address(), randomness) };

        Self { amount, randomness, signature }
    }
}

pub global ASSERTED_TOKEN_SEED_CAPSULE_SLOT: Field =
    sha256_to_field("ASSERTED_TOKEN::RANDOMNESS_SEED".as_bytes());

unconstrained fn load_randomness(
    contract_address: AztecAddress,
    side_effect_counter: u32,
) -> Field {
    let seed = capsules::load(
        contract_address,
        ASSERTED_TOKEN_SEED_CAPSULE_SLOT,
        AztecAddress::zero(),
    )
        .unwrap();

    poseidon2_hash([seed, side_effect_counter as Field])
}

pub global ASSERTED_TOKEN_NOTE_SIGNATURE_CAPSULE_SLOT: Field =
    sha256_to_field("ASSERTED_TOKEN::NOTE_SIGNATURE".as_bytes());

unconstrained fn load_signature(contract_address: AztecAddress, randomness: Field) -> Signature {
    let signature_capsule_slot =
        poseidon2_hash([ASSERTED_TOKEN_NOTE_SIGNATURE_CAPSULE_SLOT, randomness]);

    let signature: Option<Signature> = capsules::load::<Signature>(
        contract_address,
        signature_capsule_slot,
        AztecAddress::zero(),
    );

    // Allow zeroed if no signature is found, to allow simulating before submission
    let sig = signature.unwrap_or(std::mem::zeroed());

    aztec::protocol::logging::debug_log_format(
        "Fetched signature for randomness={0}: sLo={1}, sHi={2}, eLo={3}, eHi={4}",
        [randomness, sig.s_lo, sig.s_hi, sig.e_lo, sig.e_hi],
    );

    sig
}
