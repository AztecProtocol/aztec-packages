#!/usr/bin/env python3
"""Resolve REPLACE_WITH_GCP_SECRET placeholders by calling gcloud.

Reads JSON on stdin, writes JSON on stdout. Mask commands and any diagnostic
output go to stderr (must NOT pollute the JSON stdout or downstream jq pipelines
fail with "parse error"). Skipped if `gcloud` is not on PATH.
"""
import json
import os
import shutil
import subprocess
import sys

PLACEHOLDER = "REPLACE_WITH_GCP_SECRET"

# JSON-array secrets are unwrapped before masking so each element is masked
# individually (matching setup_gcp_secrets.sh behavior). Otherwise GHA may
# refuse to mask the raw `["url1","url2"]` form.
JSON_ARRAY_SECRETS = {
    "ETHEREUM_RPC_URLS",
    "ETHEREUM_CONSENSUS_HOST_URLS",
    "ETHEREUM_CONSENSUS_HOST_API_KEYS",
    "ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS",
}


# Same secret name mapping as the (legacy) setup_gcp_secrets.sh, kept in sync.
def secret_name_for(env_var, env, deploy):
    l1_network = env.get("L1_NETWORK") or deploy.get("L1_NETWORK") or "sepolia"
    network = env.get("NETWORK") or deploy.get("NETWORK") or ""
    custom_mnemonic = deploy.get("LABS_INFRA_MNEMONIC_SECRET_NAME") or env.get("LABS_INFRA_MNEMONIC_SECRET_NAME")
    mnemonic_secret = custom_mnemonic if custom_mnemonic else f"{l1_network}-labs-{network}-mnemonic"
    mapping = {
        "ETHEREUM_RPC_URLS": f"{l1_network}-rpc-urls",
        "ETHEREUM_CONSENSUS_HOST_URLS": f"{l1_network}-consensus-host-urls",
        "ETHEREUM_CONSENSUS_HOST_API_KEYS": f"{l1_network}-consensus-host-api-keys",
        "ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS": f"{l1_network}-consensus-host-api-key-headers",
        "FUNDING_PRIVATE_KEY": f"{l1_network}-funding-private-key",
        "ROLLUP_DEPLOYMENT_PRIVATE_KEY": f"{l1_network}-labs-rollup-private-key",
        "OTEL_COLLECTOR_ENDPOINT": "otel-collector-url",
        "ETHERSCAN_API_KEY": "etherscan-api-key",
        "LABS_INFRA_MNEMONIC": mnemonic_secret,
        "STORE_SNAPSHOT_URL": "r2-account-id",
        "AWS_ACCESS_KEY_ID": "r2-access-key-id",
        "AWS_SECRET_ACCESS_KEY": "r2-secret-access-key",
    }
    return mapping.get(env_var)


def emit_mask(value):
    """Emit ::add-mask:: workflow command(s) on stderr (never stdout)."""
    if not value:
        return
    # Split JSON-array values into elements before masking.
    if value.startswith("[") and value.endswith("]"):
        try:
            for element in json.loads(value):
                if element:
                    sys.stderr.write(f"::add-mask::{element}\n")
            return
        except json.JSONDecodeError:
            pass
    sys.stderr.write(f"::add-mask::{value}\n")


_secret_cache = {}


def fetch(secret_name, project_id):
    if not project_id:
        sys.stderr.write(f"resolve_secrets: GCP_PROJECT_ID not set; cannot fetch {secret_name}\n")
        return None
    if secret_name in _secret_cache:
        return _secret_cache[secret_name]
    try:
        result = subprocess.run(
            ["gcloud", "secrets", "versions", "access", "latest",
             "--secret", secret_name, "--project", project_id],
            capture_output=True, text=True, check=True,
        )
        value = result.stdout.strip()
        emit_mask(value)
        _secret_cache[secret_name] = value
        return value
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"resolve_secrets: failed to read {secret_name}: {e.stderr}\n")
        _secret_cache[secret_name] = None
        return None


def main():
    data = json.load(sys.stdin)
    env = data.get("env", {})
    deploy = data.get("deploy", {})
    project_id = deploy.get("GCP_PROJECT_ID") or os.environ.get("GCP_PROJECT_ID", "")

    if not shutil.which("gcloud"):
        json.dump(data, sys.stdout, indent=2)
        return

    # Resolve REPLACE_WITH_GCP_SECRET placeholders in env: block.
    for key, val in list(env.items()):
        if not isinstance(val, str) or PLACEHOLDER not in val:
            continue
        secret_name = secret_name_for(key, env, deploy)
        if not secret_name:
            sys.stderr.write(f"resolve_secrets: no secret mapping for {key}; leaving as placeholder\n")
            continue
        fetched = fetch(secret_name, project_id)
        if fetched is None:
            continue
        env[key] = fetched if val == PLACEHOLDER else val.replace(PLACEHOLDER, fetched)

    # Construct R2-backed URLs from r2-account-id + bucket directory inputs.
    # Mirrors setup_gcp_secrets.sh: each *_BUCKET_DIRECTORY var (in deploy: or env:)
    # becomes a fully-formed S3-compatible URL.
    def get_input(name):
        return deploy.get(name) or env.get(name) or ""

    snapshot_dir = get_input("SNAPSHOT_BUCKET_DIRECTORY")
    blob_dir = get_input("BLOB_BUCKET_DIRECTORY")
    tx_dir = get_input("TX_FILE_STORE_BUCKET_DIRECTORY")

    if snapshot_dir or blob_dir or tx_dir:
        r2 = fetch("r2-account-id", project_id)
        if r2:
            if snapshot_dir:
                env["STORE_SNAPSHOT_URL"] = (
                    f"s3://testnet-bucket/{snapshot_dir}/?endpoint=https://{r2}.r2.cloudflarestorage.com"
                    f"&publicBaseUrl=https://aztec-labs-snapshots.com"
                )
            if blob_dir:
                env["BLOB_FILE_STORE_UPLOAD_URL"] = (
                    f"s3://testnet-bucket/{blob_dir}/?endpoint=https://{r2}.r2.cloudflarestorage.com"
                )
            if tx_dir:
                env["TX_FILE_STORE_URL"] = (
                    f"s3://testnet-bucket/{tx_dir}/?endpoint=https://{r2}.r2.cloudflarestorage.com"
                )

    json.dump(data, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
