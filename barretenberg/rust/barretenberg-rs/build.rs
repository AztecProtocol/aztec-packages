fn main() {
    // Only for ffi feature - specify link order for libbarretenberg
    #[cfg(feature = "ffi")]
    {
        // Link order matters for static libraries!
        // libbarretenberg depends on libenv for logstr/throw_or_abort_impl
        println!("cargo:rustc-link-lib=static=barretenberg");
        println!("cargo:rustc-link-lib=static=env");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }
}
