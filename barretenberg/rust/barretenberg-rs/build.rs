fn main() {
    // Only for ffi feature - link libbarretenberg from cpp build
    #[cfg(feature = "ffi")]
    {
        // Find the cpp build lib directory relative to this crate
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let lib_dir = std::path::Path::new(&manifest_dir)
            .join("../../cpp/build/lib")
            .canonicalize()
            .expect("Failed to find cpp/build/lib - run barretenberg/cpp/bootstrap.sh first");

        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // Use --start-group/--end-group to handle circular dependencies between static libraries.
        // libbarretenberg.a is a mega-library containing most symbols.
        // env provides logstr, throw_or_abort_impl, env_hardware_concurrency
        // vm2_stub provides create_avm2_recursion_constraints_goblin stub (throws at runtime)
        // --allow-multiple-definition is needed because some objects are partially in libbarretenberg.a
        println!("cargo:rustc-link-arg=-Wl,--allow-multiple-definition");
        println!("cargo:rustc-link-arg=-Wl,--start-group");
        println!("cargo:rustc-link-lib=static=barretenberg");
        println!("cargo:rustc-link-lib=static=env");
        println!("cargo:rustc-link-lib=static=vm2_stub");
        println!("cargo:rustc-link-arg=-Wl,--end-group");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }
}
