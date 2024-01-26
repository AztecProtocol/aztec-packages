#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Check CMake version
check_cmake_version() {
    local cmake_preset_file="CMakePresets.json"

    # Check if CMake is installed
    if ! command -v cmake &> /dev/null; then
        echo "CMake is not installed. Please install CMake before proceeding."
        exit 1
    fi

    # Extract required CMake version from CMakePresets.json
    REQUIRED_MAJOR=$(jq -r '.cmakeMinimumRequired.major' "$cmake_preset_file")
    REQUIRED_MINOR=$(jq -r '.cmakeMinimumRequired.minor' "$cmake_preset_file")
    REQUIRED_PATCH=$(jq -r '.cmakeMinimumRequired.patch' "$cmake_preset_file")

    # Get installed CMake version
    INSTALLED_CMAKE_VERSION=$(cmake --version | head -n1 | awk '{print $3}')
    INSTALLED_MAJOR=$(echo $INSTALLED_CMAKE_VERSION | cut -d. -f1)
    INSTALLED_MINOR=$(echo $INSTALLED_CMAKE_VERSION | cut -d. -f2)
    INSTALLED_PATCH=$(echo $INSTALLED_CMAKE_VERSION | cut -d. -f3)

    # Compare versions
    if [ $INSTALLED_MAJOR -lt $REQUIRED_MAJOR ] || 
       [ $INSTALLED_MAJOR -eq $REQUIRED_MAJOR -a $INSTALLED_MINOR -lt $REQUIRED_MINOR ] || 
       [ $INSTALLED_MAJOR -eq $REQUIRED_MAJOR -a $INSTALLED_MINOR -eq $REQUIRED_MINOR -a $INSTALLED_PATCH -lt $REQUIRED_PATCH ]; then
        echo "CMake version is lower than the required version $REQUIRED_MAJOR.$REQUIRED_MINOR.$REQUIRED_PATCH for $cmake_preset_file"
        echo "Please update CMake to at least this version."
        exit 1
    fi
}

# Call the function to check CMake version
check_cmake_version

rm -f build-wasm/CMakeCache.txt

# Build WASM.
if [ -n "${WASM_DEBUG:-}" ] ; then
  cmake --preset wasm-dbg
  cmake --build --preset wasm-dbg --target aztec3-circuits.wasm
else
  cmake --preset wasm
  cmake --build --preset wasm --target aztec3-circuits.wasm
fi
