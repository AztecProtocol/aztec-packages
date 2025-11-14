#!/usr/bin/env python3
"""
Script to compile Noir program and extract gate count using bb gates command.
"""

import json
import subprocess
import sys
from pathlib import Path

NARGO = "/mnt/user-data/sergei/aztec-packages/noir/noir-repo/target/release/nargo"
BB = "/mnt/user-data/sergei/.bb/bb"
SCRIPT_DIR = Path(__file__).parent.absolute()


def compile_noir():
    """Compile the Noir program using nargo."""
    print("=== Compiling Noir program ===")
    result = subprocess.run(
        [NARGO, "compile"],
        cwd=SCRIPT_DIR,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error compiling: {result.stderr}")
        sys.exit(1)

    print("Compilation successful")
    return SCRIPT_DIR / "target" / "matrix_mult.json"


def get_gate_count(acir_file, include_per_opcode=False):
    """Get gate count using bb gates command."""
    cmd = [BB, "gates", "-s", "ultra_honk", "-b", str(acir_file)]

    if include_per_opcode:
        cmd.append("--include_gates_per_opcode")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error getting gate count: {result.stderr}")
        sys.exit(1)

    # Parse JSON output - bb outputs debug info first, then JSON
    # Find where JSON starts (line beginning with '{') and collect all JSON lines
    lines = result.stdout.strip().split('\n')
    json_lines = []
    in_json = False

    for line in lines:
        if line.startswith('{'):
            in_json = True
        if in_json:
            json_lines.append(line)

    if json_lines:
        json_output = '\n'.join(json_lines)
        return json.loads(json_output)
    else:
        print("Error: Could not parse JSON output")
        print(f"Raw output: {result.stdout}")
        sys.exit(1)


def main():
    # Compile the program
    acir_file = compile_noir()

    if not acir_file.exists():
        print(f"Error: ACIR file not found at {acir_file}")
        sys.exit(1)

    print()
    print("=== Gate Count Results ===")

    # Get basic gate count
    stats = get_gate_count(acir_file, include_per_opcode=False)

    for func in stats["functions"]:
        print(f"ACIR Opcodes: {func['acir_opcodes']}")
        print(f"Circuit Size (gates): {func['circuit_size']}")

    # Get detailed gate count
    print()
    print("=== Detailed Per-Opcode Breakdown ===")
    detailed_stats = get_gate_count(acir_file, include_per_opcode=True)

    for func in detailed_stats["functions"]:
        gates_per_opcode = func.get('gates_per_opcode', [])
        print(f"Gates per opcode: {gates_per_opcode}")

        if gates_per_opcode:
            for i, count in enumerate(gates_per_opcode):
                if count > 0:
                    print(f"  Opcode {i}: {count} gates")

    # Return as JSON for easy parsing by other tools
    print()
    print("=== JSON Output ===")
    print(json.dumps(detailed_stats, indent=2))


if __name__ == "__main__":
    main()
