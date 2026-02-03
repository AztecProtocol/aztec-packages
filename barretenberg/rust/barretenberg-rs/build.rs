fn main() {
    // Only for ffi feature - link libbb-external from cpp build
    #[cfg(feature = "ffi")]
    {
        // Find the cpp build lib directory relative to this crate
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let lib_dir = std::path::Path::new(&manifest_dir)
            .join("../../cpp/build/lib")
            .canonicalize()
            .expect("Failed to find cpp/build/lib - run barretenberg/cpp/bootstrap.sh first");

        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // libbb-external.a contains everything needed: barretenberg + env + vm2_stub
        println!("cargo:rustc-link-lib=static=bb-external");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }
}
