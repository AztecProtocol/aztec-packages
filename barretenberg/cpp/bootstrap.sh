#!/usr/bin/env bash
set -eu

# Navigate to script folder
cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -ffdx
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

# Determine system.
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS=macos
elif [[ "$OSTYPE" == "linux-gnu" ]]; then
  OS=linux
elif [[ "$OSTYPE" == "linux-musl" ]]; then
  OS=linux
else
  echo "Unknown OS: $OSTYPE"
  exit 1
fi

# Download ignition transcripts.
(cd ./srs_db && ./download_ignition.sh 0)

# Pick native toolchain file.
ARCH=$(uname -m)
if [ "$OS" == "macos" ]; then
  PRESET=default
else
  if [ "$(which clang++-16)" != "" ]; then
    PRESET=clang16
  else
    PRESET=default
  fi
fi

# Remove cmake cache files.
rm -f {build,build-wasm,build-wasm-threads}/CMakeCache.txt

echo "#################################"
echo "# Building with preset: $PRESET"
echo "# When running cmake directly, remember to use: --build --preset $PRESET"
echo "#################################"

# Build native.
cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
cmake --build --preset $PRESET --target bb

if [ ! -d ./srs_db/grumpkin ]; then
  # The Grumpkin SRS is generated manually at the moment, only up to a large enough size for tests
  # If tests require more points, the parameter can be increased here.
  (cd ./build && cmake --build . --parallel --target grumpkin_srs_gen && ./bin/grumpkin_srs_gen 8192)
fi

# Install wasi-sdk.
./scripts/install-wasi-sdk.sh

# Build WASM.
cmake --preset wasm
cmake --build --preset wasm

# Build WASM with new threading.
cmake --preset wasm-threads
cmake --build --preset wasm-threads
