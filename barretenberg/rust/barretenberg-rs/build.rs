use std::path::PathBuf;

fn main() {
    // Only for ffi feature - link libbb-external
    #[cfg(feature = "ffi")]
    {
        let lib_dir = get_lib_dir();
        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // libbb-external.a contains everything needed: barretenberg + env + vm2_stub
        println!("cargo:rustc-link-lib=static=bb-external");
        println!("cargo:rustc-link-lib=dylib=stdc++");
    }
}

#[cfg(feature = "ffi")]
fn get_lib_dir() -> PathBuf {
    // Check if user wants to use local build (for development in monorepo)
    let use_local = std::env::var("BB_LOCAL_BUILD").is_ok();

    if use_local {
        // Use local cpp build
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let local_lib_dir = std::path::Path::new(&manifest_dir).join("../../cpp/build/lib");
        if local_lib_dir.join("libbb-external.a").exists() {
            return local_lib_dir.canonicalize().unwrap();
        }
        panic!(
            "BB_LOCAL_BUILD is set but libbb-external.a not found at {:?}. \
             Build barretenberg locally: cd barretenberg/cpp && ./bootstrap.sh",
            local_lib_dir
        );
    }

    // Download from GitHub releases
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let lib_path = out_dir.join("libbb-external.a");

    if !lib_path.exists() {
        download_lib(&out_dir);
    }

    out_dir
}

#[cfg(feature = "ffi")]
fn download_lib(out_dir: &PathBuf) {
    let target = std::env::var("TARGET").unwrap();
    let arch = match target.as_str() {
        t if t.contains("x86_64") && t.contains("linux") => "amd64-linux",
        t if t.contains("aarch64") && t.contains("linux") => "arm64-linux",
        _ => panic!(
            "Unsupported target for FFI backend: {}. Supported: x86_64-linux, aarch64-linux",
            target
        ),
    };

    // Use BARRETENBERG_VERSION env var, or fall back to crate version
    let version = std::env::var("BARRETENBERG_VERSION")
        .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string());

    // Skip download for test versions (0.0.1)
    if version == "0.0.1" {
        panic!(
            "Cannot download pre-built library for test version 0.0.1. \
             Build barretenberg locally: cd barretenberg/cpp && ./bootstrap.sh"
        );
    }

    let url = format!(
        "https://github.com/AztecProtocol/aztec-packages/releases/download/v{}/barretenberg-static-{}.tar.gz",
        version, arch
    );

    println!("cargo:warning=Downloading barretenberg static library from {}", url);

    // Download and extract
    let tar_gz_path = out_dir.join("barretenberg-static.tar.gz");

    let status = std::process::Command::new("curl")
        .args(["-L", "-f", "-o"])
        .arg(&tar_gz_path)
        .arg(&url)
        .status()
        .expect("Failed to run curl");

    if !status.success() {
        panic!(
            "Failed to download barretenberg static library from {}. \
             Make sure version v{} exists as a GitHub release.",
            url, version
        );
    }

    let status = std::process::Command::new("tar")
        .args(["-xzf"])
        .arg(&tar_gz_path)
        .arg("-C")
        .arg(out_dir)
        .status()
        .expect("Failed to run tar");

    if !status.success() {
        panic!("Failed to extract barretenberg static library");
    }

    // Clean up tar.gz
    std::fs::remove_file(&tar_gz_path).ok();
}
