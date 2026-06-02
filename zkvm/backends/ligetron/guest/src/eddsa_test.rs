//! Minimal EdDSA sign+verify test using the Ligetron SDK's own API.
//!
//! Follows the pattern from:
//!   ligetron/sdk/rust/examples/eddsa/eddsa_verify_no_args.rs

use ligetron::bn254fr::Bn254Fr;
use ligetron::babyjubjub::JubjubPoint;
use ligetron::eddsa::EddsaSignature;
use ligetron::poseidon2::Poseidon2Context;

fn main() {
    // Test data matching the SDK example: private_key = 114514, message = 42
    let message = Bn254Fr::from_u32(42);

    // Public key (precomputed: private_key * G on Baby JubJub)
    let mut public_key = JubjubPoint::new(
        Bn254Fr::from_str("0x2b00e7584d377a90c4ce698903466b37b2a11cf6936e79cddf0f055a2cdb2af0"),
        Bn254Fr::from_str("0x16975c19b438cbc029c40f818efc838ea7aee80ead7e67de957cb0c925c66bbf"),
    );

    // Signature (R point + S scalar)
    let signature_r = JubjubPoint::new(
        Bn254Fr::from_str("0x248db8d47110053756e1c7c9e040f3e607494949a88e4ee54e344f18009870f9"),
        Bn254Fr::from_str("0x1ad1af70568fcaac16bcb645b189db6599506f97a3661e6a23f3bb5fba14c5fb"),
    );
    let signature_s =
        Bn254Fr::from_str("0x19084fb97be9c264ae13df247d87eee2d423f2dac3880cd4a3e6c1f6fe74f674");
    let mut signature = EddsaSignature::new(signature_r, signature_s);

    // Compute challenge hash: Poseidon2(R.x, R.y, A.x, A.y, M)
    let mut ctx = Poseidon2Context::new();
    ctx.digest_update(&signature.r.x);
    ctx.digest_update(&signature.r.y);
    ctx.digest_update(&public_key.x);
    ctx.digest_update(&public_key.y);
    ctx.digest_update(&message);
    let mut challenge = ctx.digest_final();

    println!("Running EdDSA verify...");

    // Verify: S*G == R + challenge*A
    EddsaSignature::verify(&mut signature, &mut public_key, &mut challenge);

    println!("EdDSA verify passed!");
}
