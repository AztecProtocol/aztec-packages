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

        // Use link group to handle circular dependencies between static libraries
        // libbarretenberg contains vm2_stub when built without AVM
        // libvm2 is only present when AVM is enabled
        // libenv provides logstr/throw_or_abort_impl
        println!("cargo:rustc-link-arg=-Wl,--start-group");
        println!("cargo:rustc-link-lib=static=barretenberg");
        // Only link vm2 if it exists (AVM enabled builds)
        if lib_dir.join("libvm2.a").exists() {
            println!("cargo:rustc-link-lib=static=vm2");
        }
        println!("cargo:rustc-link-lib=static=common");
        println!("cargo:rustc-link-lib=static=env");
        println!("cargo:rustc-link-arg=-Wl,--end-group");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }
}
