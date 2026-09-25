// Build script: compile the ipc-runtime C++ sources directly via cc.
//
// We deliberately don't link a prebuilt libipc_runtime.a — each consumer
// compiles the same .cpp sources with its own toolchain so the resulting
// archive is internally consistent with whatever C++ stdlib the consumer's
// final binary links. For Rust on linux that's typically libstdc++ via
// system clang; macOS gets libc++ via Apple clang. Either way, no external
// IPC_RUNTIME_LIB_DIR dependency.

use std::path::{Path, PathBuf};

/// Every non-test .cpp under `dir`, sorted for reproducible builds.
///
/// Discovered rather than listed: a hand-maintained copy of the CMake target's
/// sources silently drifts when a file is added there, and the symptom is an
/// undefined reference at link time in whichever consumer links this archive,
/// far from the change that caused it.
fn collect_sources(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()));
    for entry in entries {
        let path = entry.expect("cannot read dir entry").path();
        if path.is_dir() {
            collect_sources(&path, out);
        } else if path.extension().is_some_and(|e| e == "cpp")
            && !path.to_string_lossy().ends_with(".test.cpp")
        {
            out.push(path);
        }
    }
    out.sort();
}

fn main() {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let cpp_dir = crate_dir.join("../cpp");
    let src_dir = cpp_dir.join("ipc_runtime");

    let mut sources = Vec::new();
    collect_sources(&src_dir, &mut sources);
    assert!(!sources.is_empty(), "no C++ sources found in {}", src_dir.display());
    // Re-run when a source is added or removed, not just edited.
    println!("cargo:rerun-if-changed={}", src_dir.display());

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++20")
        .flag_if_supported("-fPIC")
        .include(&cpp_dir);

    for path in &sources {
        build.file(path);
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rerun-if-changed=build.rs");

    build.compile("ipc_runtime");

    // pthread comes via libc; the cc crate already wires the C++ stdlib link.
    println!("cargo:rustc-link-lib=pthread");
}
