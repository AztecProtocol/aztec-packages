#!/usr/bin/env python3

import sys
import os
import json
import re
from pathlib import Path

def update_dependencies(package_json_file: str):
    if not os.path.isfile(package_json_file):
        print(f"Error: {package_json_file} not found.")
        sys.exit(2)

    tsconfig_dir = os.path.dirname(package_json_file)
    ts_files = list(Path(tsconfig_dir).rglob("*.ts*"))

    import_regex = r'^import.*from.*@aztec/([a-zA-Z0-9\-\._]+)'

    dependencies = {}
    for file in ts_files:
        with open(file, "r") as f:
            for line in f:
                match = re.match(import_regex, line)
                if match:
                    package_name = match.group(1)
                    if package_name not in dependencies:
                        dependencies[package_name] = "workspace:^"

    with open(package_json_file) as f:
        package_data = json.load(f)

    # Filter out existing Aztec dependencies
    existing_dependencies = {
        key: value for key, value in package_data["dependencies"].items()
        if not key.startswith("@aztec/")
    }

    # Add new Aztec dependencies to the beginning of the list
    new_aztec_dependencies = {f"@aztec/{package}": version for package, version in dependencies.items()}
    package_data["dependencies"] = {**new_aztec_dependencies, **existing_dependencies}

    with open(package_json_file, "w") as f:
        json.dump(package_data, f, indent=2)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        print(f"Usage: {sys.argv[0]} path/to/package.json")
        sys.exit(1)

    package_json_file = sys.argv[1]
    update_dependencies(package_json_file)
