#!/usr/bin/env python3

import sys
import os
import json
import re
from pathlib import Path

# updates dependencies in the package.json file by scanning imports
def update_dependencies(package_json_file: str):
    # Verify the provided package.json file exists, otherwise exit with an error
    if not os.path.isfile(package_json_file):
        print(f"Error: {package_json_file} not found.")
        sys.exit(2)

    # Locate the directory of the package.json file to search for TypeScript files
    tsconfig_dir = os.path.dirname(package_json_file)
    ts_files = list(Path(tsconfig_dir).rglob("*.ts*"))

    # Regular expression pattern to match import statements from @aztec packages
    import_regex = r'^import.*from.*@aztec/([a-zA-Z0-9\-\._]+)'

    # Dictionary to store detected dependencies
    dependencies = {}
    for file in ts_files:
        with open(file, "r") as f:
            for line in f:
                # Check if the line is an import statement from an @aztec package
                match = re.match(import_regex, line)
                if match:
                    # Add the package to the dependencies dictionary if not already present
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
    return dependencies

# update build_manifest.json
def update_build_manifest(build_manifest_file: str, dependencies: dict, project_key: str):
    if not os.path.isfile(build_manifest_file):
        print(f"Error: {build_manifest_file} not found.")
        sys.exit(2)

    with open(build_manifest_file, "r") as f:
        build_manifest_data = json.load(f)

    if project_key in build_manifest_data:
        # Convert the dictionary of dependencies into a list of package names
        new_dependencies = [f"{package}" for package in dependencies.keys()]

        # Update the "dependencies" key in the corresponding section of the build_manifest_data
        build_manifest_data[project_key]["dependencies"] = new_dependencies

        with open(build_manifest_file, "w") as f:
            json.dump(build_manifest_data, f, indent=2)
    else:
        print(f"Error: '{project_key}' not found in build_manifest.json")
        sys.exit(3)

# Entry point for the script
if __name__ == "__main__":
    # Check if the path to the package.json file is provided as a command-line argument
    if len(sys.argv) == 1:
        print(f"Usage: {sys.argv[0]} path/to/package.json")
        sys.exit(1)

    # Call the update_dependencies function with the provided package.json file path
    package_json_file = sys.argv[1]
    dependencies = update_dependencies(package_json_file)

    # Get the directory name of the directory that holds package.json
    project_key = os.path.basename(os.path.dirname(os.path.abspath(package_json_file)))

    # Add the path to the build-manifest.json file
    build_manifest_file = os.path.join(os.path.dirname(package_json_file), '..', '..', 'build_manifest.json')

    # Call the update_build_manifest function with the provided build_manifest file path, the dependencies, and the project_key
    update_build_manifest(build_manifest_file, dependencies, project_key)