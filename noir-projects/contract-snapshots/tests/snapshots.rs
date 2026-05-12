use std::path::{Path, PathBuf};
use std::process::Command;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// `noir-projects/contract-snapshots/` -> repo root.
fn repo_root() -> PathBuf {
    manifest_dir()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn nargo_path() -> PathBuf {
    let raw = std::env::var("NARGO")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir().join("../../noir/noir-repo/target/release/nargo"));
    if raw.is_absolute() {
        raw
    } else {
        manifest_dir().join(raw)
    }
}

fn nargo(dir: &Path) -> Command {
    let mut cmd = Command::new(nargo_path());
    cmd.current_dir(dir);
    cmd
}

/// Scrubs nargo stderr before snapshotting:
///
/// 1. Drops `Waiting for lock on git dependencies cache...` lines that nargo
///    emits when concurrent test invocations contend on its git-deps cache.
/// 2. Replaces the absolute repo prefix with `<repo>` so call-stack lines
///    pointing into `aztec-nr/aztec/src/macros/...` are stable across machines.
fn scrub_stderr(s: String) -> String {
    let prefix = format!("{}/", repo_root().display());
    s.lines()
        .filter(|l| !l.contains("Waiting for lock"))
        .map(|l| l.replace(&prefix, "<repo>/"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Asserts `nargo compile` fails for `dir` and snapshots scrubbed stderr
fn run_compile_failure(name: &str, dir: PathBuf) {
    let out = nargo(&dir)
        .args(["compile", "--silence-warnings"])
        .output()
        .unwrap_or_else(|e| panic!("could not invoke nargo at {:?}: {e}", nargo_path()));
    assert!(
        !out.status.success(),
        "{name} unexpectedly compiled successfully"
    );
    let stderr = scrub_stderr(String::from_utf8(out.stderr).expect("nargo stderr should be utf-8"));
    insta::with_settings!({ snapshot_path => format!("snapshots/compile_failure/{name}") }, {
        insta::assert_snapshot!("stderr", stderr);
    });
}

/// Asserts `nargo compile` succeeds for `dir` and snapshots stderr
/// (typically empty, but captures any warnings nargo emits despite
/// `--silence-warnings`). Used for contracts that exist purely to track a
/// regression. If the test ever starts failing, the case must be moved to
/// `compile_failure/`.
fn run_compile_success(name: &str, dir: PathBuf) {
    let out = nargo(&dir)
        .args(["compile", "--silence-warnings"])
        .output()
        .unwrap_or_else(|e| panic!("could not invoke nargo at {:?}: {e}", nargo_path()));
    if !out.status.success() {
        panic!(
            "{name} unexpectedly failed to compile:\n--- stderr ---\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let stderr = scrub_stderr(String::from_utf8(out.stderr).expect("nargo stderr should be utf-8"));
    insta::with_settings!({ snapshot_path => format!("snapshots/compile_success/{name}") }, {
        insta::assert_snapshot!("stderr", stderr);
    });
}

/// Runs `nargo expand` in `dir` and snapshots stdout verbatim. The expanded
/// source has no path references, so no scrubbing is needed.
fn run_expand(name: &str, dir: PathBuf) {
    let out = nargo(&dir)
        .arg("expand")
        .output()
        .unwrap_or_else(|e| panic!("could not invoke nargo at {:?}: {e}", nargo_path()));
    if !out.status.success() {
        panic!(
            "{name} expand failed:\n--- stderr ---\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let stdout = String::from_utf8(out.stdout).expect("nargo stdout should be utf-8");
    insta::with_settings!({ snapshot_path => format!("snapshots/expand/{name}") }, {
        insta::assert_snapshot!("expanded", stdout);
    });
}

include!(concat!(env!("OUT_DIR"), "/tests.rs"));
