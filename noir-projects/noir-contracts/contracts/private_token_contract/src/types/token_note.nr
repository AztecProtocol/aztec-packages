use dep::aztec::{
    prelude::{AztecAddress, NoteHeader, NoteInterface, PrivateContext},
    protocol_types::{constants::GENERATOR_INDEX__NOTE_NULLIFIER, grumpkin_point::GrumpkinPoint, hash::poseidon2_hash},
    note::utils::compute_note_hash_for_consumption, oracle::unsafe_rand::unsafe_rand,
    keys::getters::get_nsk_app, note::note_getter_options::PropertySelector
};
use dep::std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul, fixed_base_scalar_mul};

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
global G1 = EmbeddedCurvePoint { x: 1, y: 17631683881184975370165255887551781615748388533673675138860, is_infinite: false };

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
    fn compute_note_hash_and_nullifier(self, context: &mut PrivateContext) -> ( Field, Field ) {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app(self.npk_m_hash);
        let nullifier = poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ]);
        (note_hash_for_nullify, nullifier)
    }
    // docs:end:nullifier

    fn compute_note_hash_and_nullifier_without_context(self) -> ( Field, Field ) {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nsk_app(self.npk_m_hash);
        let nullifier = poseidon2_hash([
            note_hash_for_nullify,
            secret,
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        ]);
        (note_hash_for_nullify, nullifier)
    }



    fn compute_note_content_hash(self) -> Field {
        multi_scalar_mul(
            [G1, G1, G1],
            [EmbeddedCurveScalar {
                lo: self.amount.to_integer(),
                hi: 0
            },
            EmbeddedCurveScalar {
                lo: self.npk_m_hash,
                hi: 0
            },
            EmbeddedCurveScalar {
                lo: self.randomness,
                hi: 0
            }]
        )[0]
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
        let fee_payer_point = multi_scalar_mul(
            [G1, G1],
            [EmbeddedCurveScalar {
                lo: fee_payer.to_field(),
                hi: 0
            },
            EmbeddedCurveScalar {
                lo: fee_payer_nonce,
                hi: 0
            }]
        );

        let sponsored_user_nonce = unsafe_rand();
        let sponsored_user_point = multi_scalar_mul(
            [G1, G1, G1],
            [EmbeddedCurveScalar {
                lo: sponsored_user.to_field(),
                hi: 0
            },
            EmbeddedCurveScalar {
                lo: funded_amount,
                hi: 0
            },
            EmbeddedCurveScalar {
                lo: sponsored_user_nonce,
                hi: 0
            }]
        );

        [EmbeddedCurvePoint {
            x: fee_payer_point[0],
            y: fee_payer_point[1],
            is_infinite: fee_payer_point[2] == 1
        },EmbeddedCurvePoint {
            x: sponsored_user_point[0],
            y: sponsored_user_point[1],
            is_infinite: sponsored_user_point[2] == 1
        } ]
    }

    fn complete_refund(fee_payer_point: EmbeddedCurvePoint, sponsored_user_point: EmbeddedCurvePoint, transaction_fee: Field) -> [Field; 2] {

        let fee_point_raw = multi_scalar_mul(
            [G1],
            [EmbeddedCurveScalar {
                lo: transaction_fee,
                hi: 0
            }]
        );
        let fee_point = EmbeddedCurvePoint {
            x: fee_point_raw[0],
            y: fee_point_raw[1],
            is_infinite: fee_point_raw[2] ==1
        };

        let completed_fpc_point = fee_payer_point + fee_point;

        let completed_user_point = sponsored_user_point - fee_point;
        assert_eq(completed_user_point.is_infinite, false);

        [completed_fpc_point.x, completed_user_point.x]
    }
}
