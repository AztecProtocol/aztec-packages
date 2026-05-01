#!/usr/bin/env bash
# Regression test: nothing the aztec installer ships is exposed under a
# bare name on PATH. Every entry in $HOME/.aztec/current/bin is `aztec` or
# `aztec-*`. Native binaries live in current/internal-bin (off PATH) and are
# reachable only via the `aztec-*` symlinks or via the `aztec` wrapper, which
# prepends internal-bin to PATH for its subprocesses.
#
# The assertions run twice: once after the fresh install set up by
# run_isolated_test.sh, and once after a simulated reinstall over the
# previous bin layout (bare-name symlinks plus a symlinked `aztec` directly
# in bin/). The reinstall pass guarantees the no-shadowing invariant holds
# for users upgrading from earlier installer versions, not just fresh
# installs.
set -euo pipefail

aztec_bin="$HOME/.aztec/current/bin"
node_modules_bin="$HOME/.aztec/current/node_modules/.bin"
internal_bin="$HOME/.aztec/current/internal-bin"

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
  local label="$1"
  local tool resolved
  for tool in "${shadow_targets[@]}"; do
    resolved=$(command -v "$tool")
    if [[ "$resolved" == "$HOME/.aztec/"* ]]; then
      echo "FAIL [$label]: bare '$tool' shadowed by aztec at $resolved"
      exit 1
    fi
    if [[ "$("$tool")" != "user-$tool" ]]; then
      echo "FAIL [$label]: bare '$tool' did not invoke user shim"
      exit 1
    fi
  done
}

function assert_bin_only_aztec_prefixed {
  local label="$1"
  local entry name
  for entry in "$aztec_bin"/*; do
    [ -e "$entry" ] || continue
    name=$(basename "$entry")
    if [[ "$name" != "aztec" && "$name" != aztec-* ]]; then
      echo "FAIL [$label]: bare-named entry in $aztec_bin: $name"
      exit 1
    fi
  done
}

function assert_aztec_bins_run {
  local label="$1"
  local name resolved
  for name in "${runs_version[@]}"; do
    if ! resolved=$(command -v "$name"); then
      echo "FAIL [$label]: $name not on PATH"
      exit 1
    fi
    if [[ "$resolved" != "$HOME/.aztec/"* ]]; then
      echo "FAIL [$label]: $name resolves outside aztec ($resolved)"
      exit 1
    fi
    if ! "$name" --version >/dev/null 2>&1; then
      echo "FAIL [$label]: $name --version exited non-zero"
      exit 1
    fi
  done
}

# --- Phase 1: fresh install (already done by run_isolated_test.sh) ---
assert_no_shadowing fresh
assert_bin_only_aztec_prefixed fresh
assert_aztec_bins_run fresh

# --- Phase 2: reinstall over a simulated old-layout bin/ ---
# Earlier installer versions wrote bare-name symlinks directly into bin/ for
# both native tools (forge, nargo, ...) and unprefixed @aztec npm bins (bb,
# pxe, txe, ...), and exposed `aztec` itself as a symlink to
# ../node_modules/.bin/aztec. Reconstruct that state and re-run the
# per-version installer to verify the new installer cleans it up rather
# than leaving stale bare names on PATH or writing the wrapper through the
# symlink and clobbering the npm package's aztec.sh.

# Snapshot the npm package's actual aztec.sh; if `cat >` follows a stale
# symlink at bin/aztec on reinstall, this hash will change.
aztec_sh_target=$(readlink -f "$node_modules_bin/aztec")
aztec_sh_sha_before=$(sha256sum "$aztec_sh_target" | cut -d' ' -f1)

rm -f "$aztec_bin/aztec"
ln -sfn "../node_modules/.bin/aztec" "$aztec_bin/aztec"

old_native=(forge cast anvil chisel nargo noir-profiler)
for tool in "${old_native[@]}"; do
  [ -e "$internal_bin/$tool" ] || continue
  ln -sfn "../internal-bin/$tool" "$aztec_bin/$tool"
done

# Seed bare-name symlinks only for unprefixed @aztec npm bins that actually
# exist; the set varies with @aztec/aztec's published bin map.
old_npm=()
for entry in "$node_modules_bin"/*; do
  [ -L "$entry" ] || continue
  target=$(readlink "$entry")
  [[ "$target" == ../@aztec/* ]] || continue
  name=$(basename "$entry")
  [[ "$name" == aztec || "$name" == aztec-* ]] && continue
  ln -sfn "../node_modules/.bin/$name" "$aztec_bin/$name"
  old_npm+=("$name")
done

# Reinstall. INSTALL_URI / npm_config_registry / NARGO are still in the
# environment from run_isolated_test.sh; verdaccio is still running.
INSTALL_URI="file://$HOME/aztec-packages/aztec-up/bin" \
  VERSION=0.0.1 \
  bash "$HOME/aztec-packages/aztec-up/bin/0.0.1/install"

if [ -L "$aztec_bin/aztec" ]; then
  echo "FAIL [reinstall]: bin/aztec is still a symlink"
  exit 1
fi
if [ ! -f "$aztec_bin/aztec" ]; then
  echo "FAIL [reinstall]: bin/aztec is not a regular file"
  exit 1
fi
if ! head -1 "$aztec_bin/aztec" | grep -q '^#!/usr/bin/env bash'; then
  echo "FAIL [reinstall]: bin/aztec is not a bash wrapper script"
  exit 1
fi

aztec_sh_sha_after=$(sha256sum "$aztec_sh_target" | cut -d' ' -f1)
if [ "$aztec_sh_sha_before" != "$aztec_sh_sha_after" ]; then
  echo "FAIL [reinstall]: $aztec_sh_target was rewritten by the wrapper install"
  echo "  before: $aztec_sh_sha_before"
  echo "  after:  $aztec_sh_sha_after"
  exit 1
fi

for tool in "${old_native[@]}" "${old_npm[@]}"; do
  if [ -e "$aztec_bin/$tool" ] || [ -L "$aztec_bin/$tool" ]; then
    echo "FAIL [reinstall]: stale bare-name entry remains: $aztec_bin/$tool"
    exit 1
  fi
done

assert_no_shadowing reinstall
assert_bin_only_aztec_prefixed reinstall
assert_aztec_bins_run reinstall

echo "PASS: aztec installer does not shadow user binaries; survives reinstall over the previous bin layout"
