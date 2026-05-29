// Build script: compile the ipc-runtime C++ sources directly via cc.
//
// We deliberately don't link a prebuilt libipc_runtime.a — each consumer
// (this crate, barretenberg's CMake, ipc-codegen's echo) compiles the same
// .cpp sources with its own toolchain so the resulting archive is internally
// consistent with whatever C++ stdlib the consumer's final binary links.
// For Rust on linux that's typically libstdc++ via system clang; macOS
// gets libc++ via Apple clang. Either way, no external IPC_RUNTIME_LIB_DIR
// dependency.

use std::path::PathBuf;

fn main() {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let cpp_dir = crate_dir.join("../cpp");
    let src_dir = cpp_dir.join("ipc_runtime");

    let sources = [
        "c_abi.cpp",
        "ipc_client.cpp",
        "ipc_server.cpp",
        "serve_helper.cpp",
        "signal_handlers.cpp",
        "socket_client.cpp",
        "socket_server.cpp",
        "shm/mpsc_shm.cpp",
        "shm/spsc_shm.cpp",
    ];

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++20")
        .flag_if_supported("-fPIC")
        .include(&cpp_dir);

    for src in sources {
        let path = src_dir.join(src);
        build.file(&path);
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rerun-if-changed=build.rs");

    build.compile("ipc_runtime");

    // pthread comes via libc; the cc crate already wires the C++ stdlib link.
    println!("cargo:rustc-link-lib=pthread");
}
