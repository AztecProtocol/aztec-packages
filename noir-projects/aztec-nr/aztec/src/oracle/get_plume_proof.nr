use crate::nullifier::plume::PlumeProof;
use dep::protocol_types::address::AztecAddress;
use std::embedded_curve_ops::{EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar};

struct PlumeProofOracleReturnType {
    pub _nullifier_point: [Field; 2],
    pub _A2: [Field; 2],
    pub _B2: [Field; 2],
    pub _s: [Field; 2],
}

/**
 * Intentionally named "get" instead of "compute", because the plume proof might
 * already be stored in the Executor's pxe db.
 */
#[oracle(getPlumeProof)]
unconstrained fn get_plume_proof_oracle<let N: u32>(
    msg: [Field; N],
    pk_m: [Field; 2],
) -> PlumeProofOracleReturnType {}

unconstrained fn get_plume_proof_inner<let N: u32>(
    msg: [Field; N],
    pk_m: Point,
) -> PlumeProofOracleReturnType {
    get_plume_proof_oracle(msg, [pk_m.x, pk_m.y])
}

/**
 * Makes an oracle call to the executor's pxe, to compute a plume nullifier.
 * 
 * Named as "unsafe" because the plume proof doesn't get verified here.
 * The caller needs to call `verify_plume_proof` on the result.
 *
 * @param msg: the content being passed for plume nullification. We 
 * envisage this content to be [note_hash, Npk_m.x, Npk_m.y], but we
 * keep the interface as a generic array of fields, because we've seen
 * other approaches in the wild.
 *
 * @param pk_m: The public key of the user whose secret
 * key can nullify the note. Most likely, this will be a _nullifier_ public key.
 *
 * The pxe MUST silo the msg by prepending this contract's contract_address
 * to the `msg`:
 *
 * siloed_msg = [this_contract_address, ...msg].
 *
 * More details:
 *
 * To support plume, we need:
 * - an oracle that does `hash_to_curve` on a given array of field inputs 
 *   (`msg`);
 * - an oracle that does `N = nsk * H` for a given point H.
 * - an oracle that does `s = r + nsk * c` for secret randomness r and public
 *   challenge c.
 * 
 * `r` and `nsk` MUST NOT leak into Noir.
 *
 * Whilst it might be neat to seek low-level, individual oracles, we argue
 * that such an approach would not be secure. Having an oracle which performs
 * the whole of a Plume proof generation is much easier to reason about.
 *
 * See further down this comment (or compute_plume_proof_in_tests.nr) for
 * what the oracle does.
 *
 * For security, we can't expose the `N = nsk * H` oracle by itself, because it enables
 * a malicious contract to make unlimited `N = nsk * H` queries.
 * In the case of plume nullifiers, that means it would enable an attacker to query this
 * oracle with repeated points H = hash_to_curve(note_hash, Npk) for all publicly-
 * known note hashes and user public keys. Hence, a malicious contract could use this
 * oracle to derive all nullifiers N = nsk * H for all of the user's notes.
 *
 * To prevent this attack, we have the oracle _silo_ the query point H with the calling
 * contract's address, so that if the contract tries to deduce other contracts' 
 * nullifiers, the oracle queries will be corrupted by the siloing.
 *
 * For a "N = nsk * H" query, we cannot safely silo H with a simple approach like
 * S = h(app_address) * H, because given the result N = nsk * h(app_address) * H,
 * any alternative contract address can be swapped in, by doing:
 * N' = N * h(app_address') / h(app_address).
 *
 * Therefore, we actually need to do the siloing as part of the computation of H.
 * That is, we must combine the above oracle queries into a single query.
 *
 * Oracle input: 
 *     user_address: AztecAddress, msg: [Field; N]
 * Oracle secure computations:
 *     H = hash_to_curve([app_address, ...msg]); // notice the siloing
 *     nsk = get_nsk_for_address(user_address);
 *     NullifierPoint = nsk * H;
 *     r = rand()
 *     A2 = r*G
 *     B2 = r*H
 *     c = hash(G, H, Npk, NullifierPoint, A2, B2)
 *     s = r + nsk * c
 *     return [NullifierPoint, A2, B2, s];
 * 
 * Could PXEs instead rate-limit the oracle queries? Maybe, but I'd rather be safe
 * with the design of the oracle interface instead.
 *
 * FAQ:
 * - Why doesn't this oracle support more curves?
 *     - Grumpkin is special in Aztec. The protocol assumes existence of
 *       certain Grumpkin keypairs baked into the preimage of a user's 
 *       address. Oracle interfaces for Aztec contracts' private functions
 *       form a part of the Aztec protocol, and so we're very selective.
 *       If a contract dev wants to write plume functionality for a different
 *       curve, then they will have to write that out of protocol, and will
 *       have to inject data into the circuit via function args or via 
 *       capsules.
 * - Can I pass an address_pk instead of a nullifier_pk to this function?
 *     - Technically, yes, although:
 *         - It muddles the trust assumptions of what each key should be used
 *           for. It would require usage of the ivsk, and that key was 
 *           intended for decryption rather than nullification.
 *           For some wallets, the nsk and ivsk might live in the same place,
 *           in which case perhaps it's fine to use that key. But actually,
 *           here we're in the context of an app contract. And an app contract
 *           really ought to seek to be compatible with all wallets.
 *     - The Aztec-Labs PXE's version of this oracle will not work with an 
 *       address_sk, currently.
 *             
 */
pub fn get_plume_proof_unsafe<let N: u32>(msg: [Field; N], pk_m: Point) -> PlumeProof<N> {
    // Notice that the oracle call doesn't return a PlumeProof. We want to save
    // on constraints, and it's always dangerous injecting more witness data
    // than necessary.
    // The oracle returns the bare minimum amount of data, and then (here in
    // _constrained_-land) we add existing witness data (msg and pk_m) to
    // create the returned PlumeProof.

    // Safety: Unsafe because it's an oracle call.
    let PlumeProofOracleReturnType { _nullifier_point, _A2, _B2, _s } =
        unsafe { get_plume_proof_inner(msg, pk_m) };

    let nullifier_point =
        Point { x: _nullifier_point[0], y: _nullifier_point[1], is_infinite: false };

    let A2 = Point { x: _A2[0], y: _A2[1], is_infinite: false };

    let B2 = Point { x: _B2[0], y: _B2[1], is_infinite: false };

    // TODO: construction in this way might not be safe, because
    let s = Scalar::new(_s[0], _s[1]);

    PlumeProof { msg, pk: pk_m, nullifier_point, A2, B2, s }
}

mod test {
    use crate::{
        nullifier::plume::{
            compute_plume_proof_in_tests::{compute_plume_proof_in_tests, ScalarWithOps},
            utils::scalar_mul,
            verify_plume_proof::verify_plume_proof,
        },
        test::helpers::test_environment::TestEnvironment,
    };
    use super::get_plume_proof_unsafe;
    use std::embedded_curve_ops::{
        EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar,
        FIXED_BASE_SCALAR_MUL_GENERATOR as G,
    };

    #[test]
    unconstrained fn test_compute_plume_nullifier() {
        // We need to establish a test environment, so that the keypairs we use
        // match those of the TXE.
        let mut env = TestEnvironment::new();
        let new_account_secret = 1;

        // It's unsafe to access the master secret keys within a circuit.
        // It's acceptable here, because it's a test env.
        let unsafe_account = env.unsafe_create_account(new_account_secret);

        let npk_m = unsafe_account.public_keys.npk_m.to_point();
        let nsk_f = unsafe_account.secret_keys.nsk_m;
        let nsk: Scalar = Scalar::from_field(nsk_f);
        let check_npk_m: Point = scalar_mul(nsk, G);
        assert_eq(
            check_npk_m,
            npk_m,
            "The createAccountUnsafe oracle did not compute the same Npk as in noir",
        );

        // We test the typescript (via this oracle) vs the noir.

        let app_address = env.contract_address();
        let msg = [0x2345];
        // Randomness:
        let r_n = ScalarWithOps::from_slice(&[0x1234, 0x1234, 0x12]);

        // Get a version of the nullifier from noir testing code:
        // Safety: safe because it's a test.
        let plume_proof_from_noir = compute_plume_proof_in_tests(app_address, msg, nsk_f, r_n);

        // Get a version of the nullifier via an oracle call:
        let plume_proof_from_oracle = get_plume_proof_unsafe(msg, npk_m);

        verify_plume_proof(app_address, plume_proof_from_noir);
        verify_plume_proof(app_address, plume_proof_from_oracle);

        assert_eq(
            plume_proof_from_noir.nullifier_point,
            plume_proof_from_oracle.nullifier_point,
            "A plume nullifier computed in Noir does not match the plume nullifier computed via an oracle call.",
        );

        // Note: we cannot compare the A2, B2, s values of the two plume proofs,
        // because the randomness `r` used in typescript-land MUST NOT be
        // leaked to Noir-land, or Noir would be able to derive the user's
        // master secret key.
        // TODO: consider undoing the `createAccountUnsafe` cheatcode oracle,
        // because it's dangerous, and instead comparing hard-coded test fixtures
        // from ts and noir.
    }
}
