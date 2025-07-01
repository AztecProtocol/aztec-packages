use std::hash::poseidon2_permutation;
use std::option::Option;

use dep::protocol_types::point::Point;

global TWO_POW_128: Field = 0x100000000000000000000000000000000;

/// Poseidon2 Encryption.
///
/// ~160 constraints to encrypt 8 fields. Use this hash if you favour proving speed over long-term privacy for your users.
///
/// WARNING: Poseidon2 as an _encryption scheme_ isn't considered as secure as more battle-tested encryption schemes, e.g. AES128.
/// This is because:
/// - it's relatively new;
/// - it isn't used much in the wild, so there's less incentive for hackers or bounty hunters to try to break it;
/// - it doesn't provide post-quantum privacy.
///
/// If you want to protect your users' privacy decades into the future, it might be prudent to choose
/// a more 'traditional' encryption scheme.
/// If your app is "lower stakes", and your users will only care about their privacy in the near future or immediate future, then
/// this encryption scheme might be for you!
///
/// See the paper: https://drive.google.com/file/d/1EVrP3DzoGbmzkRmYnyEDcIQcXVU7GlOd/view
///
/// Note: The return length is: L padded to the next multiple of 3, plus 1 for a message auth code of s[1].
///
/// @param encryption_nonce is only needed if your use case needs to protect against replay attacks.
pub fn poseidon2_encrypt<let L: u32>(
    msg: [Field; L],
    shared_secret: Point,
    encryption_nonce: Field,
) -> [Field; ((L + 2) / 3) * 3 + 1] {
    // TODO: assert(encryption_nonce < 2^128), assert(L < 2^120);
    let mut s =
        [0, shared_secret.x, shared_secret.y, encryption_nonce + (L as Field) * TWO_POW_128];

    // We wish to compute NUM_MISSING_ELEMENTS, which is how many elements we must add as padding so
    // that the message length becomes a multiple of 3.
    let CEIL = (L + 3 - 1) / 3; // ceil(L / 3)
    let L_UPPER_BOUND = CEIL * 3;
    let NUM_MISSING_ELEMENTS = L_UPPER_BOUND - L;

    // The Noir compiler doesn't like using the above-defined constants as array lengths,
    // so these declarations are pretty verbose:
    let mut m = [0 as Field; ((L + 3 - 1) / 3) * 3]; // [Field; L_UPPER_BOUND]
    let mut c = [0 as Field; ((L + 3 - 1) / 3) * 3 + 1]; // [Field; L_UPPER_BOUND + 1]

    for i in 0..L {
        m[i] = msg[i];
    }
    // Pad with 0's:
    for i in 0..NUM_MISSING_ELEMENTS {
        m[L + i] = 0;
    }

    for i in 0..CEIL {
        s = poseidon2_permutation(s, 4);

        // Absorb 3 elements of the message:
        let j = 3 * i;
        s[1] = s[1] + m[j];
        s[2] = s[2] + m[j + 1];
        s[3] = s[3] + m[j + 2];

        // Release 3 elements of ciphertext:
        c[j] = s[1];
        c[j + 1] = s[2];
        c[j + 2] = s[3];
    }

    // Iterate Poseidon2 on the state, one last time:
    s = poseidon2_permutation(s, 4);

    // Release the last ciphertext element:
    c[L_UPPER_BOUND] = s[1];

    c
}

pub fn poseidon2_decrypt<let L: u32>(
    ciphertext: [Field; ((L + 3 - 1) / 3) * 3 + 1],
    shared_secret: Point,
    encryption_nonce: Field,
) -> Option<[Field; L]> {
    let mut s =
        [0, shared_secret.x, shared_secret.y, encryption_nonce + (L as Field) * TWO_POW_128];

    let CEIL = (L + 3 - 1) / 3; // ceil(L / 3)
    let L_UPPER_BOUND = CEIL * 3;
    let NUM_EXTRA_ELEMENTS = L_UPPER_BOUND - L;

    let mut m = [0 as Field; ((L + 3 - 1) / 3) * 3]; // [Field; L_UPPER_BOUND]
    let c = ciphertext;

    for i in 0..CEIL {
        s = poseidon2_permutation(s, 4);

        // Release 3 elements of message:
        let j = 3 * i;
        // QUESTION: the paper says to do what's commented-out, but actually, the thing that works is the uncommented code:
        // m[j] = s[1] + c[j];
        // m[j + 1] = s[2] + c[j + 1];
        // m[j + 2] = s[3] + c[j + 2];
        m[j] = c[j] - s[1];
        m[j + 1] = c[j + 1] - s[2];
        m[j + 2] = c[j + 2] - s[3];

        // Modify state:
        s[1] = c[j];
        s[2] = c[j + 1];
        s[3] = c[j + 2];
    }

    // Iterate Poseidon2 on the state, one last time:
    s = poseidon2_permutation(s, 4);

    let mut msg: [Field; L] = [0; L];
    for i in 0..L {
        msg[i] = m[i];
    }

    let mut decryption_failed: bool = false;
    for i in 0..NUM_EXTRA_ELEMENTS {
        // If decryption is successful, and if the original plaintext was not a multiple of 3,
        // then there will be some lingering values (up to the next multiple of 3 of L) that
        // should be 0. If they are not 0, decryption has failed.
        if m[L + i] != 0 {
            decryption_failed = true;
        }
    }

    // Release the last ciphertext element:
    if c[L_UPPER_BOUND] != s[1] {
        // Decryption has failed if the message authentication code (the final
        // element of c) doesn't match s[1].
        decryption_failed = true;
    }

    if decryption_failed {
        Option::none()
    } else {
        Option::some(msg)
    }
}

mod test {
    use super::{poseidon2_decrypt, poseidon2_encrypt, TWO_POW_128};
    use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul, multi_scalar_mul};

    // Helper function that allows us to test encryption, then decryption, for various sizes of message.
    fn encrypt_then_decrypt<let N: u32>(msg: [Field; N]) {
        // Alice encrypting to Bob:

        let bob_sk = 0x2345; // Obviously, Alice doesn't know this.
        let bob_pk = fixed_base_scalar_mul(EmbeddedCurveScalar::from_field(bob_sk));

        let eph_sk = 0x5678;
        let eph_pk = fixed_base_scalar_mul(EmbeddedCurveScalar::from_field(eph_sk));
        let shared_secret = multi_scalar_mul([bob_pk], [EmbeddedCurveScalar::from_field(eph_sk)]);

        let encryption_nonce = 3; // TODO. Can even be a timestamp. Why is this even needed?

        let ciphertext = poseidon2_encrypt(msg, shared_secret, encryption_nonce);

        // ******************

        // Bob sees: [Epk, ciphertext, encryption_nonce]:

        let shared_secret = multi_scalar_mul([eph_pk], [EmbeddedCurveScalar::from_field(bob_sk)]);

        let result = poseidon2_decrypt(ciphertext, shared_secret, encryption_nonce);

        assert(result.is_some());
        assert(msg == result.unwrap_unchecked());
    }

    #[test]
    fn poseidon2_encryption() {
        encrypt_then_decrypt([1]);
        encrypt_then_decrypt([1, 2]);
        encrypt_then_decrypt([1, 2, 3]);
        encrypt_then_decrypt([1, 2, 3, 4]);
        encrypt_then_decrypt([1, 2, 3, 4, 5]);
        encrypt_then_decrypt([1, 2, 3, 4, 5, 6]);
        encrypt_then_decrypt([1, 2, 3, 4, 5, 6, 7]);
        encrypt_then_decrypt([1, 2, 3, 4, 5, 6, 7, 8]);
        encrypt_then_decrypt([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        encrypt_then_decrypt([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }

    #[test]
    fn test_poseidon2_decryption_with_bad_secret_fails() {
        // Alice encrypting to Bob:

        let bob_sk = 0x2345; // Obviously, Alice doesn't know this.
        let bob_pk = fixed_base_scalar_mul(EmbeddedCurveScalar::from_field(bob_sk));

        let eph_sk = 0x5678;
        let eph_pk = fixed_base_scalar_mul(EmbeddedCurveScalar::from_field(eph_sk));
        let shared_secret = multi_scalar_mul([bob_pk], [EmbeddedCurveScalar::from_field(eph_sk)]);

        let msg = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        let encryption_nonce = 3;

        let ciphertext = poseidon2_encrypt(msg, shared_secret, encryption_nonce);

        // ******************

        // Bob sees: [Epk, ciphertext, encryption_nonce]:

        let mut shared_secret =
            multi_scalar_mul([eph_pk], [EmbeddedCurveScalar::from_field(bob_sk)]);
        // Let's intentionally corrupt the shared secret, so that decryption should fail
        shared_secret.x += 1;

        let result = poseidon2_decrypt(ciphertext, shared_secret, encryption_nonce);

        assert(result.is_none());
    }

    // Helper function with encryption boilerplate
    fn encrypt_and_return_ct_length<let N: u32>(msg: [Field; N]) -> u32 {
        // Alice encrypting to Bob:

        let bob_sk = 0x2345; // Obviously, Alice doesn't know this.
        let bob_pk = fixed_base_scalar_mul(EmbeddedCurveScalar::from_field(bob_sk));

        let eph_sk = 0x5678;
        let shared_secret = multi_scalar_mul([bob_pk], [EmbeddedCurveScalar::from_field(eph_sk)]);

        let encryption_nonce = 3; // TODO. Can even be a timestamp. Why is this even needed?

        let ciphertext = poseidon2_encrypt(msg, shared_secret, encryption_nonce);

        ciphertext.len()
    }

    #[test]
    fn test_ciphertext_lengths() {
        // Hard-coded expectations are computed by taking the input array
        // length, computing the next multiple of 3, then adding 1.
        assert(encrypt_and_return_ct_length([1]) == 4);
        assert(encrypt_and_return_ct_length([1, 2]) == 4);
        assert(encrypt_and_return_ct_length([1, 2, 3]) == 4);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4]) == 7);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4, 5]) == 7);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4, 5, 6]) == 7);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4, 5, 6, 7]) == 10);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4, 5, 6, 7, 8]) == 10);
        assert(encrypt_and_return_ct_length([1, 2, 3, 4, 5, 6, 7, 8, 9]) == 10);
    }

    #[test]
    fn test_2_pow_128() {
        assert(2.pow_32(128) == TWO_POW_128);
    }
}
