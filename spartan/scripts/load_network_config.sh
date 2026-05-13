#!/usr/bin/env bash
# Load a per-network YAML config, deep-merge with network-defaults.yml,
# and emit the result in the requested format.
#
# Usage:
#   load_network_config.sh <network-name> [--format=env|json|tfvars]
#
# Path resolution: <network-name> may be:
#   - a bare name like "kind-minimal" (resolved to spartan/environments/networks/kind-minimal.yml)
#   - an absolute path to a YAML file
#
# Merge order (later overrides earlier):
#   1. network-defaults.yml._defaults                  (global defaults)
#   2. network-defaults.yml.networks.<network>         (preset selected via `network:` field)
#   3. <per-network YAML>                              (the file specified)
#
# Output formats:
#   env     - shell-source-able `export KEY=VALUE` lines for both deploy: and env: sections.
#             Per-release helm values are NOT exported; they're for terraform consumption.
#   json    - JSON of the fully-merged structure (deploy/env/<release>...).
#   tfvars  - terraform.tfvars.json shape: { deploy = {...}, releases = {...}, env = {...} }
#
# `${VAR}` and `${VAR:-default}` placeholders inside YAML values are expanded
# from the current shell environment after merging.

set -euo pipefail

spartan="$(git rev-parse --show-toplevel)/spartan"
defaults_yaml="$spartan/environments/network-defaults.yml"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_yaml_path() {
  local input="$1"
  if [[ "$input" = /* ]]; then
    echo "$input"
  else
    echo "$spartan/environments/networks/${input}.yml"
  fi
}

# Deep-merge YAML files left-to-right and emit JSON.
# Uses yq's `*` operator with deep-merge flag.
merge_to_json() {
  yq eval-all --output-format=json '. as $item ireduce ({}; . *+ $item)' "$@"
}

# JSON tree transforms live in sibling .py files; each reads JSON on stdin and
# writes JSON on stdout. See expand_placeholders.py, apply_derived.py,
# resolve_secrets.py for details.
expand_placeholders() { python3 "$script_dir/expand_placeholders.py"; }
apply_derived()       { python3 "$script_dir/apply_derived.py"; }
resolve_secrets()     { python3 "$script_dir/resolve_secrets.py"; }

# Strip leading underscore-prefixed keys (anchors-only keys like _defaults, _shared_image)
# from a JSON object. Operates at the top level only.
strip_underscore_keys() {
  jq 'with_entries(select(.key | startswith("_") | not))'
}

# Emit shell `export KEY=VALUE` lines for an object's string-valued keys.
emit_env() {
  local prefix="$1"  # informational; printed as comment
  jq -r --arg prefix "$prefix" '
    if . == null then
      ""
    else
      to_entries[] | select(.value != null) |
      "export \(.key)=\(.value | tostring | @sh)"
    end
  '
}

main() {
  local network_input="${1:?usage: load_network_config.sh <network-name> [--format=env|json|tfvars] [--skip-secrets]}"
  local format="env"
  local skip_secrets="false"
  shift
  for arg in "$@"; do
    case "$arg" in
      --format=*) format="${arg#--format=}" ;;
      --skip-secrets) skip_secrets="true" ;;
      *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
  done

  local network_yaml
  network_yaml="$(resolve_yaml_path "$network_input")"
  if [[ ! -f "$network_yaml" ]]; then
    echo "Network YAML not found: $network_yaml" >&2
    exit 1
  fi

  # Single tmpdir for all intermediate YAML files; cleaned up by global trap.
  local tmpdir
  tmpdir="$(mktemp -d)"
  TMPDIRS+=("$tmpdir")

  # Determine the preset (env baseline) selected by the per-network YAML, if any.
  local preset
  preset="$(yq -r '.network // ""' "$network_yaml")"

  # Pre-explode network-defaults.yml so YAML anchors (<<: *prodlike etc.) resolve
  # before we extract sub-blocks. Without this, extracted blocks would contain
  # unresolved anchor references that yq can't merge.
  local exploded_defaults="$tmpdir/defaults_exploded.yml"
  yq eval 'explode(.)' "$defaults_yaml" > "$exploded_defaults"

  # Build the loader baseline by combining:
  #   - `_release_defaults` -> top-level release blocks (validator, prover, ...)
  #   - `_deploy_defaults`  -> seeds the `deploy:` block (UPPER_SNAKE keys)
  # Per-network YAMLs (and the selected preset's env baseline) layer on top.
  local defaults_only="$tmpdir/defaults_only.yml"
  yq eval '(._release_defaults // {}) * {"deploy": (._deploy_defaults // {})}' "$exploded_defaults" > "$defaults_only"

  # Build the merged JSON.
  local merged_json
  if [[ -n "$preset" ]]; then
    # `networks.<preset>.env` is the env baseline (mirrors what codegen reads).
    # Wrap it as `{env: {...}}` so it deep-merges with per-network YAML's env block.
    local preset_env_yaml="$tmpdir/preset_env.yml"
    {
      echo "env:"
      yq eval ".networks.\"$preset\".env // {}" "$exploded_defaults" | sed 's/^/  /'
    } > "$preset_env_yaml"
    # Optional per-release defaults from `networks.<preset>.<release>` (above _release_defaults).
    local preset_releases_yaml="$tmpdir/preset_releases.yml"
    yq eval ".networks.\"$preset\" | del(.env)" "$exploded_defaults" > "$preset_releases_yaml"
    merged_json="$(merge_to_json "$defaults_only" "$preset_releases_yaml" "$preset_env_yaml" "$network_yaml")"
  else
    merged_json="$(merge_to_json "$defaults_only" "$network_yaml")"
  fi

  # Strip top-level keys we never want to export (network selector).
  merged_json="$(echo "$merged_json" | jq 'del(.network)')"

  # Expand ${VAR} placeholders from current shell env.
  merged_json="$(echo "$merged_json" | expand_placeholders)"

  # Apply derived computations (e.g. devnet's MNEMONIC_INDEX_OFFSET from NAMESPACE).
  merged_json="$(echo "$merged_json" | apply_derived)"

  # Optionally fetch GCP secrets if any REPLACE_WITH_GCP_SECRET placeholders remain.
  # Skipped automatically if `gcloud` is not on PATH; opt-out with --skip-secrets.
  if [[ "$skip_secrets" != "true" ]] && echo "$merged_json" | grep -q "REPLACE_WITH_GCP_SECRET"; then
    merged_json="$(echo "$merged_json" | resolve_secrets)"
  fi

  case "$format" in
    json)
      echo "$merged_json"
      ;;
    env)
      echo "# === deploy: ==="
      echo "$merged_json" | jq '.deploy // {}' | emit_env "deploy"
      echo "# === env: ==="
      echo "$merged_json" | jq '.env // {}' | emit_env "env"
      ;;
    tfvars)
      # Reshape into terraform.tfvars.json structure:
      #   { deploy = {...}, env = {...}, releases = { <release>: {...}, ... } }
      # `releases` collects every top-level key that isn't deploy/env.
      #
      # Pre-merge the network-wide env into each release's env (release-specific
      # overrides win) so Terraform can pass `var.releases[<key>]` straight to
      # Helm via yamlencode without needing to merge anything itself.
      # Also recurses into nested releases (e.g. prover.{node,broker,agent})
      # so they each get the network-wide env merged in.
      echo "$merged_json" | jq '
        def merge_env_into_release($baseline):
          if type == "object" then
            (if has("env") or (has("replicaCount") or has("image") or has("resources")) then
              # leaf release block: merge baseline into env (release wins)
              .env = ($baseline + (.env // {}))
            else . end) |
            with_entries(
              if .value | type == "object" then
                .value |= merge_env_into_release($baseline)
              else . end
            )
          else . end;
        . as $root |
        ($root.env // {}) as $base_env |
        {
          deploy: ($root.deploy // {}),
          env: $base_env,
          releases: (
            $root
            | with_entries(select(.key != "deploy" and .key != "env"))
            | with_entries(.value |= merge_env_into_release($base_env))
          )
        }
      '
      ;;
    *)
      echo "Unknown format: $format (valid: env, json, tfvars)" >&2
      exit 1
      ;;
  esac
}

# Global tmpdir tracking for cleanup; bash array of paths.
TMPDIRS=()
cleanup_tmpdirs() {
  local d
  for d in "${TMPDIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_tmpdirs EXIT

# Allow sourcing the file to get just the helper functions, or running it directly.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
