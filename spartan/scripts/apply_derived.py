#!/usr/bin/env python3
"""Apply derived computations after merging network config.

Replicates bash logic that previously lived inside .env files (e.g. devnet.env's
MNEMONIC_INDEX_OFFSET computed from NAMESPACE regex).

Reads JSON on stdin, writes JSON on stdout.
"""
import json
import re
import sys


def main():
    data = json.load(sys.stdin)
    env = data.setdefault("env", {})
    deploy = data.setdefault("deploy", {})

    # devnet: namespace pattern v<MAJOR>-devnet-<ITERATION> picks a non-conflicting
    # mnemonic offset so concurrent devnets sharing the same mnemonic on the same L1
    # do not collide on nonces.
    namespace = str(deploy.get("NAMESPACE", "") or env.get("NAMESPACE", ""))
    m = re.match(r"^v(\d+)-devnet-(\d+)$", namespace)
    if m:
        major = int(m.group(1))
        iteration = int(m.group(2))
        offset = major * 100000 + (iteration - 1) * 10000
    elif "MNEMONIC_INDEX_OFFSET" in env:
        offset = int(env["MNEMONIC_INDEX_OFFSET"])
    else:
        offset = 0
    env["MNEMONIC_INDEX_OFFSET"] = str(offset)

    # Mnemonic start indices: shift declared base by MNEMONIC_INDEX_OFFSET. These
    # live under deploy: because they configure the deploy script (terraform.tfvars
    # generation), not pod env. Defaults match deploy_network.sh fallbacks.
    # Fail loudly if a per-network YAML accidentally puts these under env: -- the
    # shift would silently not apply and concurrent devnets would collide on L1
    # nonces.
    def shift(key, default_base):
        if key in env:
            sys.stderr.write(
                f"load_network_config: {key} found under env: -- it must live under deploy:\n"
                f"  Move it to the deploy: block so MNEMONIC_INDEX_OFFSET is applied.\n"
            )
            sys.exit(1)
        base = int(deploy.get(key, default_base))
        deploy[key] = str(base + offset)

    shift("VALIDATOR_MNEMONIC_START_INDEX", 1)
    shift("VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX", 5000)
    shift("PROVER_PUBLISHER_MNEMONIC_START_INDEX", 8000)

    json.dump(data, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
