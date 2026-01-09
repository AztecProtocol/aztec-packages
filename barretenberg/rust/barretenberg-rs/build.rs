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
        // libbarretenberg depends on libvm2 for AVM constraints, and uses goblin_avm
        // libvm2 depends on libcommon for utilities, and depends on libbarretenberg for goblin_avm
        // libenv provides logstr/throw_or_abort_impl
        // stdc++ provides C++ runtime symbols needed by all libraries
        // Note: Using rustc-link-arg to control exact ordering
        println!("cargo:rustc-link-arg=-Wl,--start-group");
        println!("cargo:rustc-link-arg=-Wl,-Bstatic");
        println!("cargo:rustc-link-arg=-lbarretenberg");
        println!("cargo:rustc-link-arg=-lvm2");
        println!("cargo:rustc-link-arg=-lcommon");
        println!("cargo:rustc-link-arg=-lenv");
        println!("cargo:rustc-link-arg=-Wl,-Bdynamic");
        println!("cargo:rustc-link-arg=-lstdc++");
        println!("cargo:rustc-link-arg=-Wl,--end-group");
    }
}
