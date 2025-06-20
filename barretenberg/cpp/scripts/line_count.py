import csv
from os import listdir, system, path
from pathlib import Path
import shutil

# Dependency: The line counting utility cloc https://github.com/AlDanial/cloc
# Check if cloc is installed
if not shutil.which("cloc"):
    raise EnvironmentError(
        "cloc is not installed. On Ubuntu, you can install with 'sudo apt install cloc'.")

BASE_DIR = Path("src/barretenberg")
PER_FILE_REPORT_PATH = Path("build/per_file_report.csv")

# validate that directory structure hasn't changed since last run
all_dirs = sorted([d for d in listdir("src/barretenberg")
                   if path.isdir(path.join("src/barretenberg", d))])
weights = {"acir_formal_proofs": 0,
           "api": 1,
           "bb": 0,
           "benchmark": 0,
           "boomerang_value_detection": 0,
           "circuit_checker": 1,
           "client_ivc": 1,
           "commitment_schemes": 1,
           "commitment_schemes_recursion": 1,
           "common": 0,
           "crypto": 1,
           "dsl": 1,
           "ecc": 1,
           "eccvm": 1,
           "env": 0,
           "examples": 0,
           "flavor": 1,
           "goblin": 1,
           "grumpkin_srs_gen": 0,
           "honk": 1,
           "lmdblib": 0,
           "messaging": 0,
           "nodejs_module": 0,
           "numeric": 1,
           "polynomials": 1,
           "protogalaxy": 1,
           "relations": 1,
           "serialize": 1,
           "smt_verification": 0,
           "solidity_helpers": 1,
           "srs": 1,
           "stdlib": 1,
           "stdlib_circuit_builders": 1,
           "sumcheck": 1,
           "trace_to_polynomials": 1,
           "transcript": 1,
           "translator_vm": 1,
           "ultra_honk": 1,
           "vm": 0,
           "vm2": 0,
           "wasi": 0,
           "world_state": 0, }

new_dirs = list(filter(lambda x: x not in sorted(all_dirs), all_dirs))
if new_dirs:
    raise Exception("New directories without weights: ", new_dirs)

missing_dirs = list(
    filter(lambda x: x not in all_dirs, sorted(all_dirs)))
if missing_dirs:
    raise Exception("Weighted directory not found: ", missing_dirs)

print(
    f"Excluding the following directories from the audit: {[name for name, weight in weights.items() if weight == 0]}")

print(
    f"Dirs with higher weight: {[name for name, weight in weights.items() if ((weight != 0) & (weight != 1))]}")

system(
    f"cloc --include-lang='C++','C/C++ Header' --by-file --csv --out='{PER_FILE_REPORT_PATH}' {BASE_DIR}")


def count_weighted_lines():
    weighted_lines = 0
    # use cloc to count the lines in every file to be audited in the current agreement
    with open(PER_FILE_REPORT_PATH, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            if row['language'] != 'SUM':
                path = Path(row['filename']).relative_to(BASE_DIR).parts[0]
                if path in all_dirs:
                    weighted_lines += (int(row['code']) * weights[path])
    return int(weighted_lines)


print(
    f"Total number of unweighted code lines to be audited: {count_weighted_lines()}")

weights["client_ivc"] = 1.5
weights["eccvm"] = 2
weights["goblin"] = 1.5
weights["protogalaxy"] = 1.5
weights["relations"] = 2
weights["stdlib"] = 1  # partially audited so not reweighting for complexity
weights["stdlib_circuit_builders"]
weights["sumcheck"] = 1.2  # already soft-audited by Sergei; old and stableish
weights["translator_vm"] = 2

print(
    f"Total number of   weighted code lines to be audited: {count_weighted_lines()}")
