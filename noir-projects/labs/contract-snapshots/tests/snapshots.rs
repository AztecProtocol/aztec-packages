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
/// 3. Replaces `:line:col` suffixes on `<repo>` lines with `:<line>:<col>`, and
///    blanks code-frame gutter numbers in frames headed by a `<repo>` path.
///    Any macro edit shifts these positions, which would churn every
///    snapshot with diffs that carry no signal: the tests verify error text,
///    user-code locations and call-stack shape, not exact positions inside the
///    macro sources. Locations in the test program itself (`src/main.nr`) and
///    in the stdlib are kept. Alignment padding derived from the gutter digit
///    width is left alone, so a macro line number crossing a digit-count
///    boundary can still produce a whitespace-only diff.
fn scrub_stderr(s: String) -> String {
    let prefix = format!("{}/", repo_root().display());
    let mut in_repo_frame = false;
    s.lines()
        .filter(|l| !l.contains("Waiting for lock"))
        .map(|l| {
            let l = l.replace(&prefix, "<repo>/");
            let trimmed = l.trim_start();
            if trimmed.is_empty() {
                in_repo_frame = false;
            } else if trimmed.starts_with("┌─") {
                in_repo_frame = trimmed.contains("<repo>/");
            }
            if l.contains("<repo>/") {
                scrub_location_suffix(&l)
            } else if in_repo_frame {
                scrub_gutter_number(&l).unwrap_or(l)
            } else {
                l
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// `...aztec.nr:111:21` -> `...aztec.nr:<line>:<col>`; lines without a
/// trailing `:line:col` are returned unchanged.
fn scrub_location_suffix(l: &str) -> String {
    let is_num = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if let Some((rest, col)) = l.rsplit_once(':') {
        if is_num(col) {
            if let Some((rest, line)) = rest.rsplit_once(':') {
                if is_num(line) {
                    return format!("{rest}:<line>:<col>");
                }
            }
        }
    }
    l.to_string()
}

/// ` 164 │ some code` -> `     │ some code` for code-frame gutter lines.
fn scrub_gutter_number(l: &str) -> Option<String> {
    let trimmed = l.trim_start();
    let indent = l.len() - trimmed.len();
    let digits = trimmed.find(|c: char| !c.is_ascii_digit())?;
    if digits == 0 || !trimmed[digits..].starts_with(" │") {
        return None;
    }
    Some(format!(
        "{}{}",
        " ".repeat(indent + digits),
        &trimmed[digits..]
    ))
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
