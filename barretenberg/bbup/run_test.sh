#!/usr/bin/env bash
# Tests for bbup, the standalone bb installer. Modes (driven from bootstrap.sh):
#   install <version>       installs into a scratch BB_PATH and checks the bb placed there
#                           reports the requested version, and that --no-modify-path left the
#                           shell configs alone.
#   shell_config <version>  checks the PATH entry bbup writes without that flag: it must land
#                           in each shell config once, no matter how many times bbup runs.
# Both modes point HOME at a scratch dir, so a run never writes to the caller's own dotfiles.

set -e

cd $(dirname $0)/

MODE=$1
VERSION=$2

TEMP_DIR=$(mktemp -d)
trap 'rm -rf $TEMP_DIR' EXIT

export HOME=$TEMP_DIR/home
# bbup only edits configs that already exist, so seed every one it knows about.
SHELL_CONFIGS=($HOME/.bashrc $HOME/.zshrc $HOME/.config/fish/config.fish)
mkdir -p $HOME/.config/fish
touch "${SHELL_CONFIGS[@]}"

# Installs the pinned version into $1, passing any further arguments through to bbup.
# Exit code 22 is curl failing on the release download, i.e. a flaky network rather than a
# broken bbup, so it gets a couple more attempts.
function install_bb {
    local bb_path=$1
    shift
    local attempt status
    for attempt in {1..3}; do
        set +e
        BB_PATH=$bb_path ./bbup -v $VERSION "$@"
        status=$?
        set -e
        [ $status -eq 0 ] && return 0
        if [ $status -ne 22 ] || [ $attempt -eq 3 ]; then
            return $status
        fi
        echo "bbup failed with exit code 22 possibly indicating bad download, retrying..."
    done
}

# Number of lines in config $2 that mention install dir $1, whichever shell's PATH syntax
# that config uses.
function path_entries {
    grep -c -F "$1" "$2" || true
}

function test_install {
    local bb_path=$TEMP_DIR/install
    install_bb $bb_path --no-modify-path

    local seen_version=$($bb_path/bb --version)
    if ! grep "$VERSION" <<< "$seen_version" > /dev/null; then
        echo "Did not find expected version of bb"
        echo "Expected: $VERSION"
        echo "Found: $seen_version"
        exit 1
    fi

    # The point of the flag: the install stays invisible to the shell, so the seeded configs
    # are still empty. Asserting emptiness rather than the absence of the PATH line also
    # catches anything else bbup might decide to write.
    local config
    for config in "${SHELL_CONFIGS[@]}"; do
        if [ -s "$config" ]; then
            echo "bbup --no-modify-path wrote to $config:"
            cat "$config"
            exit 1
        fi
    done
}

function test_shell_config {
    local bb_path=$TEMP_DIR/install

    # The same directory installed twice: the second run must find its entry already there
    # and leave the config alone, rather than appending a duplicate.
    install_bb $bb_path
    install_bb $bb_path

    local config entries
    for config in "${SHELL_CONFIGS[@]}"; do
        entries=$(path_entries $bb_path "$config")
        if [ "$entries" != 1 ]; then
            echo "Expected exactly one PATH entry for $bb_path in $config, found $entries:"
            cat "$config"
            exit 1
        fi
    done
}

case "$MODE" in
    install|shell_config)
        test_$MODE
        ;;
    *)
        echo "Usage: $0 <install|shell_config> <version>"
        exit 1
        ;;
esac
