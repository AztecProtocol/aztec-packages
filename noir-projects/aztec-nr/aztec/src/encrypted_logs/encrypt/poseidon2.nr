use std::hash::poseidon2_permutation;

use dep::protocol_types::point::Point;

global TWO_POW_128: Field = 0x100000000000000000000000000000000;

// Poseidon2 Encryption.
//
// ~160 constraints to encrypt 8 fields. Use this hash if you favour proving speed over long-term privacy for your users.
//
// WARNING: Poseidon2 as an _encryption scheme_ isn't considered as secure as more battle-tested encryption schemes, e.g. AES128.
// This is because:
// - it's relatively new;
// - it isn't used much in the wild, so there's less incentive for hackers or bounty hunters to try to break it;
// - it doesn't provide post-quantum privacy;
// If you want to protect your users' privacy decades into the future, it might be prudent to choose
// a more 'traditional' encryption scheme.
// If your app is "lower stakes", and your users will only care about their privacy in the near future or immediate future, then
// this encryption scheme might be for you!
//
// See the paper: https://drive.google.com/file/d/1EVrP3DzoGbmzkRmYnyEDcIQcXVU7GlOd/view
//
// Note: The output ciphertext is between 1 and 3 extra fields longer than the msg, depending on `L mod 3` (where L = 0 mod 3 gives 0 extra fields).
//
// @param nonce is only needed if your use case needs to protect against replay attacks.
pub fn poseidon2_encrypt<let L: u32>(
    msg: [Field; L],
    shared_secret: Point,
    nonce: Field,
) -> [Field; ((L + 3 - 1) / 3) * 3 + 1] {
    // TODO: assert(nonce < 2^128), assert(L < 2^120);
    let mut s = [0, shared_secret.x, shared_secret.y, nonce + (L as Field) * TWO_POW_128];

    let CEIL = (L + 3 - 1) / 3; // ceil(L / 3)
    let L_UPPER_BOUND = CEIL * 3;
    let NUM_MISSING_ELEMENTS = L_UPPER_BOUND - L;

    // The Noir compiler doesn't like using the above-defined constants as array lengths,
    // so these declarations are pretty verbose:
    let mut m: [Field; ((L + 3 - 1) / 3) * 3] = [0; ((L + 3 - 1) / 3) * 3]; // [Field; L_UPPER_BOUND]
    let mut c: [Field; ((L + 3 - 1) / 3) * 3 + 1] = [0; ((L + 3 - 1) / 3) * 3 + 1]; // [Field; L_UPPER_BOUND + 1]

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

pub unconstrained fn poseidon2_decrypt<let L: u32>(
    ciphertext: [Field; ((L + 3 - 1) / 3) * 3 + 1],
    shared_secret: Point,
    nonce: Field,
) -> [Field; L] {
    let mut s = [0, shared_secret.x, shared_secret.y, nonce + (L as Field) * TWO_POW_128];

    let CEIL = (L + 3 - 1) / 3; // ceil(L / 3)
    let L_UPPER_BOUND = CEIL * 3;
    let NUM_EXTRA_ELEMENTS = L_UPPER_BOUND - L;

    let mut m: [Field; ((L + 3 - 1) / 3) * 3] = [0; ((L + 3 - 1) / 3) * 3]; // [Field; L_UPPER_BOUND]
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

    for i in 0..NUM_EXTRA_ELEMENTS {
        let j = L + i;
        assert(m[L + i] == 0, f"Element {j} of msg should be 0; got {m}");
    }

    // Iterate Poseidon2 on the state, one last time:
    s = poseidon2_permutation(s, 4);

    // Release the last ciphertext element:
    assert(c[L_UPPER_BOUND] == s[1], "Something went wrong");

    let mut msg: [Field; L] = [0; L];
    for i in 0..L {
        msg[i] = m[i];
    }

    msg
}

pub unconstrained fn poseidon2_decrypt_no_assert<let L: u32>(
    ciphertext: [Field; ((L + 3 - 1) / 3) * 3 + 1],
    shared_secret: Point,
    nonce: Field,
) -> ([Field; ((L + 3 - 1) / 3) * 3], Field) {
    let mut s = [0, shared_secret.x, shared_secret.y, nonce + (L as Field) * TWO_POW_128];

    let CEIL = (L + 3 - 1) / 3; // ceil(L / 3)

    let mut m: [Field; ((L + 3 - 1) / 3) * 3] = [0; ((L + 3 - 1) / 3) * 3]; // [Field; L_UPPER_BOUND]
    let c = ciphertext;

    for i in 0..CEIL {
        s = poseidon2_permutation(s, 4);

        // Release 3 elements of message:
        let j = 3 * i;
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

    // We return the un-trimmed message `m`, so the user may handle a failed decryption gracefully.
    // We return s[1], so the user may check whether the last element of the ciphertext `== s[1]`, gracefully.
    (m, s[1])
}

mod test {
    use super::{poseidon2_decrypt, poseidon2_encrypt};
    use std::{
        embedded_curve_ops::{fixed_base_scalar_mul, multi_scalar_mul},
        hash::from_field_unsafe as fr_to_fq_unsafe,
    };

    #[test]
    fn test_poseidon2_encryption() {
        // Alice encrypting to Bob:

        // let alice_sk = 0x1234;
        // let alice_pk = fixed_base_scalar_mul(fr_to_fq_unsafe(alice_sk));

        println("\nEncrypting...");

        let bob_sk = 0x2345; // Obviously, Alice doesn't know this.
        let bob_pk = fixed_base_scalar_mul(fr_to_fq_unsafe(bob_sk));

        let eph_sk = 0x5678;
        let eph_pk = fixed_base_scalar_mul(fr_to_fq_unsafe(eph_sk));
        let shared_secret = multi_scalar_mul([bob_pk], [fr_to_fq_unsafe(eph_sk)]);

        let msg = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        println(f"\nmsg: {msg}");

        let nonce = 3; // TODO. Can even be a timestamp. Why is this even needed?

        let ciphertext = poseidon2_encrypt(msg, shared_secret, nonce);

        println(f"\nciphertext: {ciphertext}");

        // ******************

        // Bob sees: [Epk, ciphertext, nonce]:

        println("\nDecrypting...");

        let shared_secret = multi_scalar_mul([eph_pk], [fr_to_fq_unsafe(bob_sk)]);

        let plaintext = unsafe { poseidon2_decrypt(ciphertext, shared_secret, nonce) };

        println(f"plaintext: {plaintext}");

        assert(msg == plaintext);

        println("Successfully decrypted!")
    }

}
