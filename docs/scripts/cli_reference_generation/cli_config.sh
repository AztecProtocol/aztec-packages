#!/bin/bash
# Shared CLI configuration for documentation generation scripts
# Reads configuration from cli_docs_config.json (single source of truth)
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/cli_config.sh"
#   get_cli_config "aztec"
#   echo "$CLI_DISPLAY_NAME"  # "Aztec CLI"
#
# Requires: jq

# Path to JSON config file (source of truth)
CLI_CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_CONFIG_JSON="$CLI_CONFIG_DIR/cli_docs_config.json"

# Check for jq dependency
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed" >&2
  echo "  Install with: brew install jq (macOS) or apt install jq (Linux)" >&2
  return 1 2>/dev/null || exit 1
fi

# Check config file exists
if [[ ! -f "$CLI_CONFIG_JSON" ]]; then
  echo "Error: Config file not found: $CLI_CONFIG_JSON" >&2
  return 1 2>/dev/null || exit 1
fi

# Read valid CLI names from JSON config
# Note: Using process substitution to avoid subshell issues with arrays
VALID_CLIS=()
while IFS= read -r cli; do
  VALID_CLIS+=("$cli")
done < <(jq -r '.clis | keys[]' "$CLI_CONFIG_JSON")
readonly VALID_CLIS

# Get configuration for a CLI from JSON
# Sets: CLI_DISPLAY_NAME, CLI_TITLE, CLI_COMMAND, CLI_FORMAT,
#       CLI_OUTPUT_FILE, CLI_SIDEBAR_POSITION, CLI_TAGS
get_cli_config() {
  local cli_name="$1"

  # Check if CLI exists in config
  local cli_config
  cli_config=$(jq -r ".clis[\"$cli_name\"] // empty" "$CLI_CONFIG_JSON")

  if [[ -z "$cli_config" ]]; then
    echo "Error: Unknown CLI '$cli_name'. Valid options: ${VALID_CLIS[*]}" >&2
    return 1
  fi

  # Extract values from JSON
  CLI_DISPLAY_NAME=$(echo "$cli_config" | jq -r '.display_name')
  CLI_TITLE=$(echo "$cli_config" | jq -r '.title')
  CLI_COMMAND=$(echo "$cli_config" | jq -r '.command')
  CLI_FORMAT=$(echo "$cli_config" | jq -r '.format')
  CLI_OUTPUT_FILE=$(echo "$cli_config" | jq -r '.output_file')
  CLI_SIDEBAR_POSITION=$(echo "$cli_config" | jq -r '.sidebar_position')
  CLI_TAGS=$(echo "$cli_config" | jq -r '.tags | "[" + join(", ") + "]"')
}

# Validate CLI name against JSON config
validate_cli_name() {
  local cli_name="$1"
  for valid in "${VALID_CLIS[@]}"; do
    if [[ "$cli_name" == "$valid" ]]; then
      return 0
    fi
  done
  echo "Error: Invalid CLI name '$cli_name'. Must be one of: ${VALID_CLIS[*]}" >&2
  return 1
}

# Get install instructions for a CLI
get_cli_install_instructions() {
  local cli_name="$1"
  case "$cli_name" in
    bb)
      echo "Install bb from: https://github.com/AztecProtocol/aztec-packages"
      ;;
    aztec-up)
      echo "Run: VERSION=<version> bash -i <(curl -sL https://install.aztec.network/<version>)"
      ;;
    *)
      echo "Run: aztec-up <version>"
      ;;
  esac
}
