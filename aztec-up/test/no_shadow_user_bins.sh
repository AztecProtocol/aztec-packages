#!/usr/bin/env bash
# Regression test: nothing the aztec installer ships is exposed under a
# bare name on PATH. Every entry in $HOME/.aztec/current/bin is `aztec` or
# `aztec-*`. Native binaries live in current/internal-bin (off PATH) and are
# reachable only via the `aztec-*` symlinks or via the `aztec` wrapper, which
# prepends internal-bin to PATH for its subprocesses.
set -euo pipefail

aztec_bin="$HOME/.aztec/current/bin"

# Names this test exercises. Pre-create user-installed sentinel shims that
# print known strings, then assert bare names resolve to them after install
# (i.e. NOT shadowed by aztec). The shim directory comes AFTER the aztec bin
# on PATH, mirroring a realistic user setup where the shell PATH update was
# the last step. Names cover every bare bin the installer used to expose.
shadow_targets=(
  forge cast anvil chisel
  nargo noir-profiler noir-codegen
  bb bb-cli
  pxe txe validator-client blob-client
)
user_bin="$HOME/.local/bin"
mkdir -p "$user_bin"
for tool in "${shadow_targets[@]}"; do
  printf '#!/usr/bin/env bash\necho "user-%s"\n' "$tool" > "$user_bin/$tool"
  chmod +x "$user_bin/$tool"
done
export PATH="$PATH:$user_bin"

# Bins known to support --version cleanly under the new (aztec-prefixed) layout.
runs_version=(aztec aztec-forge aztec-cast aztec-anvil aztec-chisel aztec-nargo aztec-noir-profiler)

function assert_no_shadowing {
  local tool resolved
  for tool in "${shadow_targets[@]}"; do
    resolved=$(command -v "$tool")
    if [[ "$resolved" == "$HOME/.aztec/"* ]]; then
      echo "FAIL: bare '$tool' shadowed by aztec at $resolved"
      exit 1
    fi
    if [[ "$("$tool")" != "user-$tool" ]]; then
      echo "FAIL: bare '$tool' did not invoke user shim"
      exit 1
    fi
  done
}

function assert_bin_only_aztec_prefixed {
  local entry name
  for entry in "$aztec_bin"/*; do
    [ -e "$entry" ] || continue
    name=$(basename "$entry")
    if [[ "$name" != "aztec" && "$name" != aztec-* ]]; then
      echo "FAIL: bare-named entry in $aztec_bin: $name"
      exit 1
    fi
  done
}

function assert_aztec_bins_run {
  local name resolved
  for name in "${runs_version[@]}"; do
    if ! resolved=$(command -v "$name"); then
      echo "FAIL: $name not on PATH"
      exit 1
    fi
    if [[ "$resolved" != "$HOME/.aztec/"* ]]; then
      echo "FAIL: $name resolves outside aztec ($resolved)"
      exit 1
    fi
    if ! "$name" --version >/dev/null 2>&1; then
      echo "FAIL: $name --version exited non-zero"
      exit 1
    fi
  done
}

assert_no_shadowing
assert_bin_only_aztec_prefixed
assert_aztec_bins_run

echo "PASS: aztec installer does not shadow user binaries"
