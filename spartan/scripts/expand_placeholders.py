#!/usr/bin/env python3
"""Expand ${VAR} and ${VAR:-default} placeholders in string values.

Reads JSON on stdin, writes JSON on stdout. Used by load_network_config.sh
to substitute current shell environment into merged YAML values.
"""
import json
import os
import re
import sys

PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


def expand(value):
    if isinstance(value, str):
        return PATTERN.sub(lambda m: os.environ.get(m.group(1), m.group(2) or ""), value)
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    if isinstance(value, list):
        return [expand(v) for v in value]
    return value


def main():
    data = json.load(sys.stdin)
    json.dump(expand(data), sys.stdout, indent=2)


if __name__ == "__main__":
    main()
