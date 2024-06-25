use dep::aztec::{
    prelude::{AztecAddress, NoteHeader, NoteInterface, PrivateContext},
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, grumpkin_point::GrumpkinPoint, hash::poseidon2_hash},
    note::utils::compute_note_hash_for_consumption, oracle::unsafe_rand::unsafe_rand,
    keys::getters::get_nsk_app, note::note_getter_options::PropertySelector
};
use dep::std::embedded_curve_ops::EmbeddedCurvePoint;
use crate::lib::{is_on_grumpkin, fixed_base_scalar_mul, fixed_base_multi_scalar_mul};

trait OwnedNote {
    fn new(amount: U128, owner_npk_m_hash: Field) -> Self;
    fn get_amount(self) -> U128;
    fn get_owner_npk_m_hash(self) -> Field;
    fn get_owner_selector() -> PropertySelector;
}

trait PrivatelyRefundable {
    fn generate_refund_points(
        fee_payer: AztecAddress,
        sponsored_user: AztecAddress,
        funded_amount: Field
    ) -> [EmbeddedCurvePoint; 2];

    fn complete_refund(
        fee_payer_point: EmbeddedCurvePoint,
        sponsored_user_point: EmbeddedCurvePoint,
        transaction_fee: Field
    ) -> [Field; 2];
}

global TOKEN_NOTE_LEN: Field = 3; // 3 plus a header.
global TOKEN_NOTE_BYTES_LEN: Field = 3 * 32 + 64;

#[aztec(note)]
struct TokenNote {
    // The amount of tokens in the note
    amount: U128,
    // The nullifying public key hash is used with the nsk_app to ensure that the note can be privately spent.
    npk_m_hash: Field,
    // Randomness of the note to hide its contents
    randomness: Field,
}

impl NoteInterface<TOKEN_NOTE_LEN, TOKEN_NOTE_BYTES_LEN> for TokenNote {
    // docs:start:nullifier
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app(self.npk_m_hash);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }
    // docs:end:nullifier

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nsk_app(self.npk_m_hash);
        poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ])
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field, ovpk_m: GrumpkinPoint, ivpk_m: GrumpkinPoint) {
      // We only bother inserting the note if non-empty to save funds on gas.
      // TODO: (#5901) This will be changed a lot, as it should use the updated encrypted log format
      if !(self.amount == U128::from_integer(0)) {
          context.encrypt_and_emit_note(
              (*context).this_address(),
              slot,
              Self::get_note_type_id(),
              ovpk_m,
              ivpk_m,
              self,
          );
      }
    }

    fn compute_note_content_hash(self) -> Field {
        (fixed_base_scalar_mul(
                self.amount.to_integer()
            ) + fixed_base_scalar_mul(
                self.npk_m_hash
            ) + fixed_base_scalar_mul(
                self.randomness
        )).x

    }
}

impl OwnedNote for TokenNote {
    fn new(amount: U128, owner_npk_m_hash: Field) -> Self {
        Self {
            amount,
            npk_m_hash: owner_npk_m_hash,
            randomness: unsafe_rand(),
            header: NoteHeader::empty(),
        }
    }

    fn get_amount(self) -> U128 {
        self.amount
    }

    fn get_owner_npk_m_hash(self) -> Field {
        self.npk_m_hash
    }

    fn get_owner_selector() -> PropertySelector {
        PropertySelector { index: 1, offset: 0, length: 32 }
    }
}

impl PrivatelyRefundable for TokenNote {
    fn generate_refund_points(fee_payer: AztecAddress, sponsored_user: AztecAddress, funded_amount: Field) -> [EmbeddedCurvePoint; 2] {


        let fee_payer_nonce = unsafe_rand();
        let fee_payer_point = fixed_base_multi_scalar_mul([
            fee_payer.to_field(),
            fee_payer_nonce,
        ]);
        assert_eq(fee_payer_point.is_infinite, false);

        let sponsored_user_nonce = unsafe_rand();
        let sponsored_user_point = fixed_base_multi_scalar_mul([
            sponsored_user.to_field(),
            funded_amount,
            sponsored_user_nonce,
        ]);
        assert_eq(sponsored_user_point.is_infinite, false);

        [fee_payer_point, sponsored_user_point]
    }

    fn complete_refund(fee_payer_point: EmbeddedCurvePoint, sponsored_user_point: EmbeddedCurvePoint, transaction_fee: Field) -> [Field; 2] {

        let fee_point = fixed_base_scalar_mul(transaction_fee);

        let completed_fpc_point = fee_payer_point + fee_point;

        let completed_user_point = sponsored_user_point - fee_point;
        assert_eq(completed_user_point.is_infinite, false);

        [completed_fpc_point.x, completed_user_point.x]
    }
}
