#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Released versions link included code at their tag rather than at master.
if semver check $REF_NAME; then
  export COMMIT_TAG=$REF_NAME
fi

# The bb-docs-deps make step runs it every build.
function install {
  npm_install_deps
}

# A check that the site builds, after install: the bb-docs make step records its pass (nothing uses build/).
function build {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not building bb docs for arm64 in CI."
    return
  fi
  echo_header "build bb docs"
  denoise "yarn build"
}

function test_cmds {
  # The recursive example proves a circuit embedding a full in-circuit Honk verifier in WASM. It takes
  # ~35s on an idle box, but this lane runs alongside the bb build, and when that rebuilds everything
  # the test slows by an order of magnitude (>400s seen on 4 CPUs). The published bb.js it uses is
  # not built from this tree, so that slowdown says nothing about the change under test: budget for
  # it here, and in the test's own jest timeout, rather than fail on it.
  echo "${STEP_KEY:-disabled-cache}:CPUS=4:TIMEOUT=1500s barretenberg/docs/bootstrap.sh test"
}

function test {
  if [ "${CI:-0}" -eq 1 ] && [ $(arch) == arm64 ]; then
    echo "Not testing bb docs for arm64 in CI."
    return
  fi
  echo_header "test docs"

  denoise "yarn test"
}

case "$cmd" in
  "")
    # Through make, so that it is skipped when the check has already passed.
    make -C "$root" bb-docs
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
