// Build script for the ipc-runtime Rust crate.
//
// Links against libipc_runtime.a. The archive path comes from
//   $IPC_RUNTIME_LIB_DIR   (must contain libipc_runtime.a)
// or falls back to a sibling cpp build dir relative to this crate.
//
// Cross-compile: a per-target archive should already exist at the right
// IPC_RUNTIME_LIB_DIR. We don't try to (re)build the C++ library from
// here — the parent build system orchestrates that.

use std::env;
use std::path::PathBuf;

fn main() {
    let crate_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = env::var("IPC_RUNTIME_LIB_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| crate_dir.join("../cpp/build"));

    if !lib_dir.join("libipc_runtime.a").exists() {
        panic!(
            "ipc-runtime: libipc_runtime.a not found at {}. \
             Set IPC_RUNTIME_LIB_DIR or build ipc-runtime/cpp/ first.",
            lib_dir.display()
        );
    }

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=ipc_runtime");

    // The C++ runtime needs libstdc++ (Linux) or libc++ (macOS) and pthread.
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-lib=c++");
    } else {
        println!("cargo:rustc-link-lib=stdc++");
    }
    println!("cargo:rustc-link-lib=pthread");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=IPC_RUNTIME_LIB_DIR");
}
