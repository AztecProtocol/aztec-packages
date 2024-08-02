use dep::aztec::{
    generators::{Ga1 as G_amt, Ga2 as G_npk, Ga3 as G_rnd, G_slot},
    prelude::{NoteHeader, NoteInterface, PrivateContext},
    protocol_types::{
    constants::GENERATOR_INDEX__NOTE_NULLIFIER, point::Point, scalar::Scalar,
    hash::poseidon2_hash_with_separator
},
    note::utils::compute_note_hash_for_consumption, oracle::unsafe_rand::unsafe_rand,
    keys::getters::get_nsk_app
};
use dep::std::{embedded_curve_ops::multi_scalar_mul, hash::from_field_unsafe};

trait OwnedNote {
    fn new(amount: U128, owner_npk_m_hash: Field) -> Self;
    fn get_amount(self) -> U128;
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
    fn compute_note_hash_and_nullifier(self, context: &mut PrivateContext) -> ( Field, Field ) {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nsk_app(self.npk_m_hash);
        let nullifier = poseidon2_hash_with_separator([note_hash_for_nullify, secret], GENERATOR_INDEX__NOTE_NULLIFIER);
        (note_hash_for_nullify, nullifier)
    }
    // docs:end:nullifier

    fn compute_note_hash_and_nullifier_without_context(self) -> ( Field, Field ) {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nsk_app(self.npk_m_hash);
        let nullifier = poseidon2_hash_with_separator([note_hash_for_nullify,secret,],GENERATOR_INDEX__NOTE_NULLIFIER);
        (note_hash_for_nullify, nullifier)
    }

    fn compute_note_hiding_point(self) -> Point {
        // We use the unsafe version because the multi_scalar_mul will constrain the scalars.
        let npk_m_hash_scalar = from_field_unsafe(self.npk_m_hash);
        let randomness_scalar = from_field_unsafe(self.randomness);
        // TODO(benesjan): decompose amount with from_field_unsafe or constrain it fits into limb
        let amount_scalar = Scalar {
            lo: self.amount.to_integer(),
            hi: 0
        };
        // We compute the note hiding point as `G_amt * amount + G_npk * npk_m_hash + G_rnd * randomness` instead
        // of using pedersen or poseidon2 because it allows us to privately add and subtract from amount in public
        // by leveraging homomorphism.
        multi_scalar_mul(
            [G_amt, G_npk, G_rnd],
            [amount_scalar, npk_m_hash_scalar, randomness_scalar]
        )
    }
}

impl TokenNote {
    // TODO: Merge this func with `compute_note_hiding_point`. I (benesjan) didn't do it in the initial PR to not have
    // to modify macros and all the related funcs in it.
    fn to_note_hiding_point(self) -> TokenNoteHidingPoint {
        TokenNoteHidingPoint::new(self.compute_note_hiding_point())
    }
}

struct TokenNoteHidingPoint {
  inner: Point
}

impl TokenNoteHidingPoint {
    fn new(point: Point) -> Self {
        Self { inner: point }
    }

    fn add_amount(&mut self, amount: U128) {
        // TODO(benesjan): decompose amount with from_field_unsafe or constrain it fits into limb
        let amount_scalar = Scalar { lo: amount.to_integer(), hi: 0 };
        self.inner = multi_scalar_mul([G_amt], [amount_scalar]) + self.inner;
    }

    fn add_npk_m_hash(&mut self, npk_m_hash: Field) {
        self.inner = multi_scalar_mul([G_npk], [from_field_unsafe(npk_m_hash)]) + self.inner;
    }

    fn add_randomness(&mut self, randomness: Field) {
        self.inner = multi_scalar_mul([G_rnd], [from_field_unsafe(randomness)]) + self.inner;
    }

    fn add_slot(&mut self, slot: Field) {
        self.inner = multi_scalar_mul([G_slot], [from_field_unsafe(slot)]) + self.inner;
    }

    fn finalize(self) -> Field {
        self.inner.x
    }
}

impl Eq for TokenNote {
    fn eq(self, other: Self) -> bool {
        (self.amount == other.amount) &
        (self.npk_m_hash == other.npk_m_hash) &
        (self.randomness == other.randomness)
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
}

/**
 * What is happening below?
 *
 * First in generate_refund_points, we create two points on the grumpkin curve;
 * these are going to be eventually turned into notes:
 * one for the user, and one for the fee payer.
 *
 * So you can think of these (x, y) points as "partial notes": they encode part of the internals of the notes.
 *
 * This is because the compute_note_hiding_point function above defines the hiding point as:
 *
 * G_amt * amount + G_npk * npk_m_hash + G_rnd * randomness
 * 
 * where G_amt, G_npk and G_rnd are generator points. Interesting point here is that we actually need to convert
 * - amount
 * - npk_m_hash
 * - randomness
 * from grumpkin Field elements
 * (which have a modulus of 21888242871839275222246405745257275088548364400416034343698204186575808495617)
 * into a grumpkin scalar
 * (which have a modulus of 21888242871839275222246405745257275088696311157297823662689037894645226208583)
 *
 * The intuition for this is that the Field elements define the domain of the x, y coordinates for points on
 * the curves, but the number of points on the curve is actually greater than the size of that domain.
 *
 * (Consider, e.g. if the curve were defined over a field of 10 elements, and each x coord had two corresponding
 * y for +/-)
 *
 * For a bit more info, see
 * https://hackmd.io/@aztec-network/ByzgNxBfd#2-Grumpkin---A-curve-on-top-of-BN-254-for-SNARK-efficient-group-operations
 *
 *
 * Anyway, if we have a secret scalar s, and then we reveal a point s * G (G being a generator), there is no efficient
 * way to deduce what s is. This is the discrete log problem.
 *
 * However we can still perform addition/subtraction on points! That is why we generate those two points, which are:
 * incomplete_fee_payer_point := G_npk * fee_payer_npk + G_rnd * fee_payer_randomness
 * incomplete_user_point := G_npk * user_npk + G_rnd * user_randomness
 *
 * So we pass those points into the teardown function (here) and compute a third point corresponding to the transaction
 * fee as just:
 *
 * fee_point := G_amt * transaction_fee
 * refund_point := G_amt * (funded_amount - transaction_fee)
 *
 * where `funded_amount` is the total amount in tokens that the sponsored user initially supplied and the transaction
 * fee is the final transaction fee whose value is made available in the public teardown function.
 *
 * Then we arrive at the final points via addition of the fee and refund points:
 *
 * fee_payer_point := incomplete_fee_payer_point + fee_point =
 *                  = (G_npk * fee_payer_npk + G_rnd * fee_payer_randomness) + G_amt * transaction_fee =
 *                  = G_amt * transaction_fee + G_npk * fee_payer_npk + G_rnd * fee_payer_randomness
 *
 * user_point := incomplete_user_point + refund_point =
 *             = (G_npk * user_npk + G_rnd + user_randomness) + G_amt * (funded_amount - transaction_fee) =
 *             = G_amt * (funded_amount - transaction_fee) + G_npk * user_npk + G_rnd * user_randomness
 * 
 * The point above matches the note_hiding_point of (and therefore *is*) notes like:
 * {
 *     amount: (funded_amount - transaction_fee),
 *     npk_m_hash: user_npk,
 *     randomness: user_randomness
 * }
 *
 * Why do we need different randomness for the user and the fee payer notes?
 * --> This is because if the randomness values were the same we could fingerprint the user by doing the following:
 *      1) randomness_influence = incomplete_fee_payer_point - G_npk * fee_payer_npk =
 *                              = (G_npk * fee_payer_npk + G_rnd * randomness) - G_npk * fee_payer_npk =
 *                              = G_rnd * randomness
 *      2) user_fingerprint = incomplete_user_point - randomness_influence =
 *                          = (G_npk * user_npk + G_rnd * randomness) - G_rnd * randomness =
 *                          = G_npk * user_npk
 *      3) Then the second time the user would use this fee paying contract we would recover the same fingerprint and
 *         link that the 2 transactions were made by the same user. Given that it's expected that only a limited set
 *         of fee paying contracts will be used and they will be known, searching for fingerprints by trying different
 *         fee payer npk values of these known contracts is a feasible attack.
 */
