#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the git root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || echo "")"

# Default paths (relative to git root)
DEFAULT_NOIR_ROOT="$GIT_ROOT/noir/noir-repo"
DEFAULT_TRANSPILER_BIN="$GIT_ROOT/avm-transpiler/target/release/avm-transpiler"
DEFAULT_SIMULATOR_BIN="$GIT_ROOT/yarn-project/simulator/dest/scripts/fuzzing/avm_simulator_bin.cjs"

# Usage information
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --noir-path PATH        Path to the Noir repository root"
    echo "                          Default: $DEFAULT_NOIR_ROOT"
    echo ""
    echo "  --transpiler-path PATH  Path to the avm_transpiler binary"
    echo "                          Default: $DEFAULT_TRANSPILER_BIN"
    echo ""
    echo "  --simulator-path PATH   Path to the avm_simulator_bin.cjs file"
    echo "                          Default: $DEFAULT_SIMULATOR_BIN"
    echo ""
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0"
    echo "  $0 --noir-path /path/to/noir"
    echo "  $0 --transpiler-path /path/to/avm_transpiler --simulator-path /path/to/simulator.cjs"
    exit 1
}

# Initialize with defaults
NOIR_ROOT_DIR="$DEFAULT_NOIR_ROOT"
TRANSPILER_BIN="$DEFAULT_TRANSPILER_BIN"
SIMULATOR_BIN="$DEFAULT_SIMULATOR_BIN"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --noir-path)
            NOIR_ROOT_DIR="$2"
            shift 2
            ;;
        --transpiler-path)
            TRANSPILER_BIN="$2"
            shift 2
            ;;
        --simulator-path)
            SIMULATOR_BIN="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Error: Unknown option: $1${NC}"
            echo ""
            usage
            ;;
    esac
done

# Validate paths
if [ ! -d "$NOIR_ROOT_DIR" ]; then
    echo -e "${RED}Error: Noir root directory does not exist: $NOIR_ROOT_DIR${NC}"
    exit 1
fi

if [ ! -f "$TRANSPILER_BIN" ]; then
    echo -e "${RED}Error: AVM transpiler binary does not exist: $TRANSPILER_BIN${NC}"
    exit 1
fi

if [ ! -f "$SIMULATOR_BIN" ]; then
    echo -e "${RED}Error: AVM simulator binary does not exist: $SIMULATOR_BIN${NC}"
    exit 1
fi

# Check for ssa_fuzzer directory in noir-repo
FUZZER_DIR="$NOIR_ROOT_DIR/tooling/ssa_fuzzer/fuzzer"
if [ ! -d "$FUZZER_DIR" ]; then
    echo -e "${RED}Error: Fuzzer directory does not exist: $FUZZER_DIR${NC}"
    echo -e "${YELLOW}Make sure PATH_TO_NOIR_ROOT_DIR points to the Noir repository root.${NC}"
    exit 1
fi

echo -e "${GREEN}Building fuzzer...${NC}"
yarn build:fuzzer

echo -e "${GREEN}Checking for cargo-fuzz installation...${NC}"

# Check if cargo-fuzz is installed
if ! cargo fuzz --version &> /dev/null; then
    echo -e "${RED}Error: cargo-fuzz is not installed.${NC}"
    echo ""
    echo -e "${YELLOW}To install cargo-fuzz, run:${NC}"
    echo -e "  ${GREEN}cargo install cargo-fuzz${NC}"
    echo ""
    echo -e "${YELLOW}Note: cargo-fuzz requires a nightly Rust toolchain.${NC}"
    echo -e "If you don't have it, install with:${NC}"
    echo -e "  ${GREEN}rustup install nightly${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}cargo-fuzz is installed: $(cargo fuzz --version)${NC}"
echo -e "${GREEN}Build complete!${NC}"
echo ""
echo -e "${GREEN}Starting fuzzer with:${NC}"
echo -e "  Noir root:    $NOIR_ROOT_DIR"
echo -e "  Transpiler:   $TRANSPILER_BIN"
echo -e "  Simulator:    $SIMULATOR_BIN"
echo ""

# Run the fuzzer
cd "$FUZZER_DIR"
SIMULATOR_BIN_PATH="$SIMULATOR_BIN" TRANSPILER_BIN_PATH="$TRANSPILER_BIN" cargo +nightly fuzz run --fuzz-dir . brillig -- -max_len=10000
