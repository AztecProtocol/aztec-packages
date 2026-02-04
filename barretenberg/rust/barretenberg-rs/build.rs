use std::path::PathBuf;

fn main() {
    // Only for ffi feature - link libbb-external
    #[cfg(feature = "ffi")]
    {
        let lib_dir = get_lib_dir();
        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // libbb-external.a contains everything needed: barretenberg + env + vm2_stub
        println!("cargo:rustc-link-lib=static=bb-external");

        // Link C++ standard library (different name on macOS/iOS vs Linux/Android)
        let target = std::env::var("TARGET").unwrap();
        if target.contains("apple") {
            println!("cargo:rustc-link-lib=dylib=c++");
        } else if target.contains("android") {
            println!("cargo:rustc-link-lib=dylib=c++_shared");
        } else {
            println!("cargo:rustc-link-lib=dylib=stdc++");
        }
    }
}

#[cfg(feature = "ffi")]
fn get_lib_dir() -> PathBuf {
    // Check if user provided a custom library path
    if let Ok(lib_dir) = std::env::var("BB_LIB_DIR") {
        let lib_dir = PathBuf::from(&lib_dir);
        if lib_dir.join("libbb-external.a").exists() {
            return lib_dir.canonicalize().unwrap();
        }
        panic!(
            "BB_LIB_DIR is set to {:?} but libbb-external.a not found there. \
             Build barretenberg locally: cd barretenberg/cpp && ./bootstrap.sh",
            lib_dir
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
        // Linux
        t if t.contains("x86_64") && t.contains("linux") => "amd64-linux",
        t if t.contains("aarch64") && t.contains("linux") => "arm64-linux",
        // macOS
        t if t.contains("x86_64") && t.contains("apple") && t.contains("darwin") => "amd64-darwin",
        t if t.contains("aarch64") && t.contains("apple") && t.contains("darwin") => "arm64-darwin",
        // iOS simulator (must check before ios since "ios-sim" contains "ios")
        t if t.contains("aarch64") && t.contains("apple") && t.contains("ios-sim") => {
            "arm64-ios-sim"
        }
        // iOS device
        t if t.contains("aarch64") && t.contains("apple") && t.contains("ios") => "arm64-ios",
        // Android
        t if t.contains("aarch64") && t.contains("android") => "arm64-android",
        t if t.contains("x86_64") && t.contains("android") => "x86_64-android",
        _ => panic!(
            "Unsupported target for FFI backend: {}. \
             Supported: x86_64-linux, aarch64-linux, x86_64-apple-darwin, aarch64-apple-darwin, \
             aarch64-apple-ios, aarch64-apple-ios-sim, aarch64-linux-android, x86_64-linux-android",
            target
        ),
    };

    // Use BARRETENBERG_VERSION env var, or fall back to crate version
    let version = std::env::var("BARRETENBERG_VERSION")
        .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string());

    // Skip download for development versions (0.x.x without BARRETENBERG_VERSION override)
    // Real releases use the aztec-packages version (e.g., 4.0.0) set via BARRETENBERG_VERSION
    if version.starts_with("0.") && std::env::var("BARRETENBERG_VERSION").is_err() {
        panic!(
            "Cannot download pre-built library for development version {}. \
             Either set BARRETENBERG_VERSION to a released version, or \
             set BB_LIB_DIR to point to a local build: cd barretenberg/cpp && ./bootstrap.sh",
            version
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
