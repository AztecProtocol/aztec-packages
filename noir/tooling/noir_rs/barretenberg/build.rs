use cmake::Config;

fn main() {
    // Notify Cargo to rerun this build script if `build.rs` changes.
    println!("cargo:rerun-if-changed=build.rs");

    // Build the C++ code using CMake and get the build directory path.
    let dst = Config::new("../../../../barretenberg/cpp")
        .configure_arg("-DCMAKE_BUILD_TYPE=RelWithAssert")
        .define("TARGET_ARCH", "skylake")
        .build();

    // Add the library search path for Rust to find during linking.
    println!("cargo:rustc-link-search={}/lib", dst.display());

    // Link the `barretenberg` static library.
    println!("cargo:rustc-link-lib=static=barretenberg");

    // Link the C++ standard library.
    if cfg!(target_os = "macos") || cfg!(target_os = "ios") {
        println!("cargo:rustc-link-lib=c++");
    } else {
        println!("cargo:rustc-link-lib=stdc++");
    }

    // Begin setting up bindgen to generate Rust bindings for C++ code.
    let bindings = bindgen::Builder::default()
        // Provide Clang arguments for C++20 and specify we are working with C++.
        .clang_args(&["-std=c++20", "-xc++"])
        // Add the include path for headers.
        .clang_args([format!("-I{}/include", dst.display())])
        // Specify the headers to generate bindings from.
        .header_contents(
            "wrapper.hpp",
            r#"
                #include <barretenberg/srs/rust_bind.hpp>
                #include <barretenberg/examples/rust_bind.hpp>
                #include <barretenberg/crypto/schnorr/rust_bind.hpp>
                #include <barretenberg/dsl/acir_proofs/rust_bind.hpp>
                #include <barretenberg/crypto/pedersen_hash/rust_bind.hpp>
                #include <barretenberg/crypto/pedersen_commitment/rust_bind.hpp>
            "#,
        )
        .allowlist_function("rust_acir_get_circuit_sizes")
        .allowlist_function("rust_acir_new_acir_composer")
        .allowlist_function("rust_acir_delete_acir_composer")
        .allowlist_function("rust_acir_create_circuit")
        .allowlist_function("rust_acir_init_proving_key")
        .allowlist_function("rust_acir_create_proof")
        .allowlist_function("rust_acir_load_verification_key")
        .allowlist_function("rust_acir_init_verification_key")
        .allowlist_function("rust_acir_get_verification_key")
        .allowlist_function("rust_acir_verify_proof")
        .allowlist_function("rust_acir_get_solidity_verifier")
        .allowlist_function("rust_acir_serialize_proof_into_fields")
        .allowlist_function("rust_acir_serialize_verification_key_into_fields")
        .allowlist_function("rust_pedersen_hash")
        .allowlist_function("rust_pedersen_commit")
        .allowlist_function("rust_schnorr_compute_public_key")
        .allowlist_function("rust_schnorr_construct_signature")
        .allowlist_function("rust_schnorr_verify_signature")
        .allowlist_function("rust_srs_init_srs")
        .allowlist_function("rust_examples_simple_create_and_verify_proof")
        // Generate the bindings.
        .generate()
        .expect("Couldn't generate bindings!");

    // Determine the output path for the bindings using the OUT_DIR environment variable.
    let out_path = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());

    // Write the generated bindings to a file.
    bindings.write_to_file(out_path.join("bindings.rs")).expect("Couldn't write bindings!");
}
