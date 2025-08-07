#!/usr/bin/env python3
"""
Configuration-based gas benchmarking script for l1-contracts.
Runs forge tests directly and generates human-readable reports.
"""

import json
import os
import subprocess
from typing import Dict, List, Any


# Configuration for different benchmark scenarios
BENCHMARK_CONFIGS = {
    "no_validators": {
        "name": "No Validators",
        "tests": [
            {
                "command": [
                    "forge",
                    "test",
                    "--match-contract",
                    "BenchmarkRollupTest",
                    "--match-test",
                    "test_no_validators",
                    "--fuzz-seed",
                    "42",
                    "-vv",
                    "--json",
                ],
                "priority": 1,
            }
        ],
        "focus_functions": [
            "propose",
            "setupEpoch",
            "submitEpochRootProof",
        ],
    },
    "validators": {
        "name": "Validators",
        "tests": [
            {
                "command": [
                    "forge",
                    "test",
                    "--match-contract",
                    "BenchmarkRollupTest",
                    "--match-test",
                    "test_100_validators",
                    "--fuzz-seed",
                    "42",
                    "-vv",
                    "--json",
                ],
                "priority": 1,
            },
            {
                "command": [
                    "forge",
                    "test",
                    "--match-contract",
                    "BenchmarkRollupTest",
                    "--match-test",
                    "test_100_slashing_validators",
                    "--fuzz-seed",
                    "42",
                    "-vv",
                    "--json",
                ],
                "priority": 2,  # Lower priority - only use if function not in priority 1
            },
        ],
        "focus_functions": [
            "propose",
            "setupEpoch",
            "submitEpochRootProof",
            "aggregate3",
        ],
    },
}


def run_forge_test(command: List[str], ignition: bool = False) -> Dict[str, Any]:
    """Run a forge test command and return the JSON output."""
    print(f"Running: {' '.join(command)}")
    print(f"IGNITION environment variable set to: {ignition}")

    # Add FORGE_GAS_REPORT environment variable
    env = os.environ.copy()
    env["FORGE_GAS_REPORT"] = "true"

    # Set IGNITION environment variable based on config
    env["IGNITION"] = "true" if ignition else "false"

    try:
        result = subprocess.run(
            command, capture_output=True, text=True, check=True, env=env
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error running forge test: {e}")
        print(f"stderr: {e.stderr}")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON output: {e}")
        return {}


def extract_config(ignition: bool = False) -> Dict[str, int]:
    """Run the test_log_config test to extract configuration values."""
    print(f"Extracting configuration for IGNITION={ignition}")

    command = [
        "forge",
        "test",
        "--match-contract",
        "BenchmarkRollupTest",
        "--match-test",
        "test_log_config",
        "--fuzz-seed",
        "42",
        "-vv",
        "--json",
    ]

    # Add IGNITION environment variable but NOT FORGE_GAS_REPORT
    env = os.environ.copy()
    env["IGNITION"] = "true" if ignition else "false"
    # Remove FORGE_GAS_REPORT if it exists to get decoded_logs
    env.pop("FORGE_GAS_REPORT", None)

    try:
        result = subprocess.run(
            command, capture_output=True, text=True, check=True, env=env
        )

        output = json.loads(result.stdout)

        # Extract config from decoded_logs
        config = {}
        for contract_data in output.values():
            if isinstance(contract_data, dict) and "test_results" in contract_data:
                for test_name, test_data in contract_data["test_results"].items():
                    if "test_log_config" in test_name and "decoded_logs" in test_data:
                        # Parse decoded logs like ["SLOT_DURATION: 60", "EPOCH_DURATION: 48", ...]
                        for log in test_data["decoded_logs"]:
                            if ":" in log:
                                parts = log.split(":", 1)
                                if len(parts) == 2:
                                    key = parts[0].strip()
                                    value = parts[1].strip()
                                    try:
                                        config[key] = int(value)
                                    except ValueError:
                                        # Skip if not a number
                                        pass

        return config
    except Exception as e:
        print(f"Error extracting config: {e}")
        return {}


def extract_calldata_sizes_from_logs(forge_output: Any) -> Dict[str, int]:
    """Extract calldata sizes from log_named_uint logs."""
    calldata_sizes = {}

    if isinstance(forge_output, dict):
        for contract_name, contract_data in forge_output.items():
            if not isinstance(contract_data, dict):
                continue

            # Check if we have gas report data (no test_results) vs full test data
            if "test_results" not in contract_data:
                # This is gas report format, skip
                continue

            if "test_results" in contract_data:
                for test_data in contract_data["test_results"].values():
                    if "decoded_logs" in test_data:
                        for log in test_data["decoded_logs"]:
                            # Look for log_named_uint with calldata_size suffix
                            # Format examples: "propose_calldata_size: 1234"
                            if "_calldata_size:" in log:
                                try:
                                    parts = log.split(":", 1)
                                    if len(parts) == 2:
                                        key = parts[0].strip()
                                        value = parts[1].strip()
                                        # Extract function name from key
                                        if key.endswith("_calldata_size"):
                                            func_name = key[
                                                :-14
                                            ]  # Remove "_calldata_size"
                                            # We overwrite to keep the last occurrence
                                            calldata_sizes[func_name] = int(value)
                                except (ValueError, IndexError):
                                    pass

    return calldata_sizes


def calculate_eip7623_calldata_gas(calldata_size: int, total_gas_cost: int) -> int:
    """
    Calculate calldata gas cost under EIP-7623.
    https://eips.ethereum.org/EIPS/eip-7623

    For simplicity, we assume that there are no zero bytes.
    """

    nonzero_bytes = calldata_size
    zero_bytes = calldata_size - nonzero_bytes

    # Standard calldata cost
    standard_calldata_cost = 4 * (4 * nonzero_bytes + zero_bytes)

    floor_price = 10 * (4 * nonzero_bytes + zero_bytes)

    if total_gas_cost >= floor_price:
        return standard_calldata_cost

    return floor_price


def extract_gas_data_from_forge_output(
    forge_output: Any, target_functions: List[str]
) -> Dict[str, Dict]:
    """Extract gas data for specific functions from forge JSON output."""
    function_data = {}

    # Handle different forge output formats
    # The output might be a list of contracts or a dict
    if isinstance(forge_output, list):
        # Iterate through contracts in the list
        for contract_entry in forge_output:
            if (
                not isinstance(contract_entry, dict)
                or "functions" not in contract_entry
            ):
                continue

            # Look for our target functions
            for func_name, gas_stats in contract_entry["functions"].items():
                for target in target_functions:
                    if target in func_name:
                        function_data[target] = gas_stats
                        break

    elif isinstance(forge_output, dict):
        # Navigate through forge's JSON structure
        for contract_data in forge_output.values():
            if not isinstance(contract_data, dict):
                continue

            # Look for gas reports in the contract data
            if "test_results" in contract_data:
                for test_data in contract_data["test_results"].values():
                    if "gas_report" in test_data:
                        for functions in test_data["gas_report"].values():
                            for func_name, gas_stats in functions.items():
                                # Check if this matches any target function
                                for target in target_functions:
                                    if target in func_name:
                                        function_data[target] = gas_stats
                                        break

            # Also check if gas data is at contract level
            if "functions" in contract_data:
                for func_name, gas_stats in contract_data["functions"].items():
                    for target in target_functions:
                        if target in func_name:
                            function_data[target] = gas_stats
                            break

    return function_data


def merge_gas_data_with_priority(
    data_list: List[Dict[str, Dict]], priorities: List[int]
) -> Dict[str, Dict]:
    """
    Merge gas data from multiple sources based on priority.
    Lower priority number = higher precedence.
    """
    merged = {}

    # Sort by priority (ascending)
    sorted_data = sorted(zip(data_list, priorities), key=lambda x: x[1])

    for data, _ in sorted_data:
        for func_name, gas_stats in data.items():
            if func_name not in merged:
                merged[func_name] = gas_stats

    return merged


def run_benchmark_config(
    config: Dict[str, Any], ignition: bool = False
) -> Dict[str, Dict]:
    """Run all tests for a configuration and return merged gas data."""
    all_gas_data = []
    priorities = []

    for test in config["tests"]:
        # First run without FORGE_GAS_REPORT to get decoded logs with calldata sizes
        env = os.environ.copy()
        env["IGNITION"] = "true" if ignition else "false"
        env.pop("FORGE_GAS_REPORT", None)  # Remove to get decoded_logs

        print(f"Extracting calldata sizes for: {' '.join(test['command'])}")

        calldata_sizes = {}
        try:
            result = subprocess.run(
                test["command"], capture_output=True, text=True, check=True, env=env
            )
            logs_output = json.loads(result.stdout)
            calldata_sizes = extract_calldata_sizes_from_logs(logs_output)
            print(f"Found calldata sizes: {calldata_sizes}")
        except Exception as e:
            print(f"Error extracting calldata sizes: {e}")

        # Then run with gas report to get gas data
        forge_output = run_forge_test(test["command"], ignition)

        # Extract gas data
        gas_data = extract_gas_data_from_forge_output(
            forge_output, config["focus_functions"]
        )

        # Add calldata sizes to gas data
        for func_name, size in calldata_sizes.items():
            if func_name in gas_data:
                gas_data[func_name]["calldata_size"] = size
                # Use the mean gas value as total gas cost for EIP-7623 calculation
                mean_gas = gas_data[func_name].get("mean", 0)
                gas_data[func_name]["calldata_gas"] = calculate_eip7623_calldata_gas(
                    size, mean_gas
                )

        all_gas_data.append(gas_data)
        priorities.append(test["priority"])

    # Merge results based on priority
    return merge_gas_data_with_priority(all_gas_data, priorities)


def seconds_to_hms(seconds: int) -> str:
    """Convert seconds to hours:minutes:seconds format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours}h {minutes}m {secs}s"


def generate_markdown_report(
    ignition_results: Dict[str, Dict[str, Dict]],
    alpha_results: Dict[str, Dict[str, Dict]],
    ignition_config: Dict[str, int],
    alpha_config: Dict[str, int],
    output_file: str = "gas_benchmark.md",
):
    """Generate a human-readable markdown report from benchmark results."""
    lines = []

    # Sort functions in desired order
    function_order = [
        "propose",
        "submitEpochRootProof",
        "aggregate3",
        "setupEpoch",
    ]

    # Add header
    lines.append("# Gas Benchmark Report\n")

    # First, add all IGNITION results
    lines.append("## IGNITION\n")

    # Add IGNITION configuration
    if ignition_config:
        lines.append("### Configuration\n")

        # Define the configuration parameters to display
        config_params = [
            ("Slot Duration", ignition_config.get("SLOT_DURATION", "N/A")),
            ("Epoch Duration", ignition_config.get("EPOCH_DURATION", "N/A")),
            (
                "Target Committee Size",
                ignition_config.get("TARGET_COMMITTEE_SIZE", "N/A"),
            ),
            ("Mana Target", f"{ignition_config.get('MANA_TARGET', 0):,}"),
            (
                "Proofs per Epoch",
                f"{ignition_config.get('PROOFS_PER_EPOCH', 200) / 100:.2f}",
            ),
        ]

        # Calculate column widths
        param_col_width = max(
            len("Parameter"), max(len(param[0]) for param in config_params)
        )
        value_col_width = max(
            len("Value"), max(len(str(param[1])) for param in config_params)
        )

        # Table header with proper spacing
        header = f"| {'Parameter':<{param_col_width}} | {'Value':>{value_col_width}} |"
        separator = f"|{'-' * (param_col_width + 2)}|{'-' * (value_col_width + 2)}|"

        lines.append(header)
        lines.append(separator)

        # Add data rows with proper spacing
        for param_name, param_value in config_params:
            row = f"| {param_name:<{param_col_width}} | {param_value:>{value_col_width}} |"
            lines.append(row)

        lines.append("")

    for config_name, gas_data in ignition_results.items():
        config_display_name = BENCHMARK_CONFIGS[config_name]["name"]
        lines.append(f"### {config_display_name} (IGNITION)\n")

        # Get functions for this config in the desired order
        config_functions = [f for f in function_order if f in gas_data]

        if not config_functions:
            lines.append("*No gas data available*\n")
            continue

        # Calculate column widths for proper alignment
        func_col_width = max(len("Function"), max(len(f) for f in config_functions))
        avg_col_width = max(
            len("Avg Gas"),
            max(len(f"{gas_data[f].get('mean', 0):,}") for f in config_functions),
        )
        max_col_width = max(
            len("Max Gas"),
            max(len(f"{gas_data[f].get('max', 0):,}") for f in config_functions),
        )

        # Calldata columns - check if any function has calldata size
        has_calldata = any("calldata_size" in gas_data[f] for f in config_functions)
        if has_calldata:
            calldata_size_col_width = max(
                len("Calldata Size"),
                max(
                    len(f"{gas_data[f].get('calldata_size', 0):,}")
                    for f in config_functions
                    if "calldata_size" in gas_data[f]
                ),
            )
            calldata_gas_col_width = max(
                len("Calldata Gas"),
                max(
                    len(f"{gas_data[f].get('calldata_gas', 0):,}")
                    for f in config_functions
                    if "calldata_gas" in gas_data[f]
                ),
            )

        # Table header with proper spacing
        if has_calldata:
            header = f"| {'Function':<{func_col_width}} | {'Avg Gas':>{avg_col_width}} | {'Max Gas':>{max_col_width}} | {'Calldata Size':>{calldata_size_col_width}} | {'Calldata Gas':>{calldata_gas_col_width}} |"
            separator = f"|{'-' * (func_col_width + 2)}|{'-' * (avg_col_width + 2)}|{'-' * (max_col_width + 2)}|{'-' * (calldata_size_col_width + 2)}|{'-' * (calldata_gas_col_width + 2)}|"
        else:
            header = f"| {'Function':<{func_col_width}} | {'Avg Gas':>{avg_col_width}} | {'Max Gas':>{max_col_width}} |"
            separator = f"|{'-' * (func_col_width + 2)}|{'-' * (avg_col_width + 2)}|{'-' * (max_col_width + 2)}|"

        lines.append(header)
        lines.append(separator)

        # Add data rows with proper spacing
        for func_name in config_functions:
            func_data = gas_data[func_name]
            avg_value = func_data.get("mean", 0)
            max_value = func_data.get("max", 0)

            if has_calldata and "calldata_size" in func_data:
                calldata_size = func_data["calldata_size"]
                calldata_gas = func_data.get("calldata_gas", 0)
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} | {calldata_size:>{calldata_size_col_width},} | {calldata_gas:>{calldata_gas_col_width},} |"
            elif has_calldata:
                # Add empty cells for functions without calldata info
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} | {'-':>{calldata_size_col_width}} | {'-':>{calldata_gas_col_width}} |"
            else:
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} |"
            lines.append(row)

        lines.append("")  # Empty line between tables

        # Calculate and add gas cost per second for IGNITION mode
        if (
            all(
                func in gas_data
                for func in ["setupEpoch", "propose", "submitEpochRootProof"]
            )
            and ignition_config
        ):
            slot_duration = ignition_config.get("SLOT_DURATION", 1)
            epoch_duration = ignition_config.get("EPOCH_DURATION", 1)
            proofs_per_epoch = (
                ignition_config.get("PROOFS_PER_EPOCH", 200) / 100
            )  # Convert from e2 to decimal

            # Get average gas values
            setup_epoch_gas = gas_data["setupEpoch"].get("mean", 0)
            propose_gas = gas_data["propose"].get("mean", 0)
            submit_proof_gas = gas_data["submitEpochRootProof"].get("mean", 0)

            # Calculate gas cost per second
            total_epoch_gas = (
                setup_epoch_gas
                + (propose_gas * epoch_duration)
                + (submit_proof_gas * proofs_per_epoch)
            )
            epoch_duration_seconds = slot_duration * epoch_duration
            gas_per_second = (
                total_epoch_gas / epoch_duration_seconds
                if epoch_duration_seconds > 0
                else 0
            )

            lines.append(
                f"**Avg Gas Cost per Second**: {gas_per_second:,.1f} gas/second"
            )
            lines.append(f"*Epoch duration*: {seconds_to_hms(epoch_duration_seconds)}")
            lines.append("")

    # Then, add all Alpha results
    lines.append("\n## Alpha\n")

    # Add Alpha configuration
    if alpha_config:
        lines.append("### Configuration\n")

        # Define the configuration parameters to display
        config_params = [
            ("Slot Duration", alpha_config.get("SLOT_DURATION", "N/A")),
            ("Epoch Duration", alpha_config.get("EPOCH_DURATION", "N/A")),
            ("Target Committee Size", alpha_config.get("TARGET_COMMITTEE_SIZE", "N/A")),
            ("Mana Target", f"{alpha_config.get('MANA_TARGET', 0):,}"),
            (
                "Proofs per Epoch",
                f"{alpha_config.get('PROOFS_PER_EPOCH', 200) / 100:.2f}",
            ),
        ]

        # Calculate column widths
        param_col_width = max(
            len("Parameter"), max(len(param[0]) for param in config_params)
        )
        value_col_width = max(
            len("Value"), max(len(str(param[1])) for param in config_params)
        )

        # Table header with proper spacing
        header = f"| {'Parameter':<{param_col_width}} | {'Value':>{value_col_width}} |"
        separator = f"|{'-' * (param_col_width + 2)}|{'-' * (value_col_width + 2)}|"

        lines.append(header)
        lines.append(separator)

        # Add data rows with proper spacing
        for param_name, param_value in config_params:
            row = f"| {param_name:<{param_col_width}} | {param_value:>{value_col_width}} |"
            lines.append(row)

        lines.append("")

    for config_name, gas_data in alpha_results.items():
        config_display_name = BENCHMARK_CONFIGS[config_name]["name"]
        lines.append(f"### {config_display_name} (Alpha)\n")

        # Get functions for this config in the desired order
        config_functions = [f for f in function_order if f in gas_data]

        if not config_functions:
            lines.append("*No gas data available*\n")
            continue

        # Calculate column widths for proper alignment
        func_col_width = max(len("Function"), max(len(f) for f in config_functions))
        avg_col_width = max(
            len("Avg Gas"),
            max(len(f"{gas_data[f].get('mean', 0):,}") for f in config_functions),
        )
        max_col_width = max(
            len("Max Gas"),
            max(len(f"{gas_data[f].get('max', 0):,}") for f in config_functions),
        )

        # Calldata columns - check if any function has calldata size
        has_calldata = any("calldata_size" in gas_data[f] for f in config_functions)
        if has_calldata:
            calldata_size_col_width = max(
                len("Calldata Size"),
                max(
                    len(f"{gas_data[f].get('calldata_size', 0):,}")
                    for f in config_functions
                    if "calldata_size" in gas_data[f]
                ),
            )
            calldata_gas_col_width = max(
                len("Calldata Gas"),
                max(
                    len(f"{gas_data[f].get('calldata_gas', 0):,}")
                    for f in config_functions
                    if "calldata_gas" in gas_data[f]
                ),
            )

        # Table header with proper spacing
        if has_calldata:
            header = f"| {'Function':<{func_col_width}} | {'Avg Gas':>{avg_col_width}} | {'Max Gas':>{max_col_width}} | {'Calldata Size':>{calldata_size_col_width}} | {'Calldata Gas':>{calldata_gas_col_width}} |"
            separator = f"|{'-' * (func_col_width + 2)}|{'-' * (avg_col_width + 2)}|{'-' * (max_col_width + 2)}|{'-' * (calldata_size_col_width + 2)}|{'-' * (calldata_gas_col_width + 2)}|"
        else:
            header = f"| {'Function':<{func_col_width}} | {'Avg Gas':>{avg_col_width}} | {'Max Gas':>{max_col_width}} |"
            separator = f"|{'-' * (func_col_width + 2)}|{'-' * (avg_col_width + 2)}|{'-' * (max_col_width + 2)}|"

        lines.append(header)
        lines.append(separator)

        # Add data rows with proper spacing
        for func_name in config_functions:
            func_data = gas_data[func_name]
            avg_value = func_data.get("mean", 0)
            max_value = func_data.get("max", 0)

            if has_calldata and "calldata_size" in func_data:
                calldata_size = func_data["calldata_size"]
                calldata_gas = func_data.get("calldata_gas", 0)
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} | {calldata_size:>{calldata_size_col_width},} | {calldata_gas:>{calldata_gas_col_width},} |"
            elif has_calldata:
                # Add empty cells for functions without calldata info
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} | {'-':>{calldata_size_col_width}} | {'-':>{calldata_gas_col_width}} |"
            else:
                row = f"| {func_name:<{func_col_width}} | {avg_value:>{avg_col_width},} | {max_value:>{max_col_width},} |"
            lines.append(row)

        lines.append("")  # Empty line between tables

        # Calculate and add gas cost per second for Alpha mode
        if (
            all(
                func in gas_data
                for func in ["setupEpoch", "propose", "submitEpochRootProof"]
            )
            and alpha_config
        ):
            slot_duration = alpha_config.get("SLOT_DURATION", 1)
            epoch_duration = alpha_config.get("EPOCH_DURATION", 1)
            proofs_per_epoch = (
                alpha_config.get("PROOFS_PER_EPOCH", 200) / 100
            )  # Convert from e2 to decimal

            # Get average gas values
            setup_epoch_gas = gas_data["setupEpoch"].get("mean", 0)
            propose_gas = gas_data["propose"].get("mean", 0)
            submit_proof_gas = gas_data["submitEpochRootProof"].get("mean", 0)

            # Calculate gas cost per second
            total_epoch_gas = (
                setup_epoch_gas
                + (propose_gas * epoch_duration)
                + (submit_proof_gas * proofs_per_epoch)
            )
            epoch_duration_seconds = slot_duration * epoch_duration
            gas_per_second = (
                total_epoch_gas / epoch_duration_seconds
                if epoch_duration_seconds > 0
                else 0
            )

            lines.append(
                f"**Avg Gas Cost per Second**: {gas_per_second:,.1f} gas/second"
            )
            lines.append(f"*Epoch duration*: {seconds_to_hms(epoch_duration_seconds)}")

            lines.append("")

    # Write to file
    with open(output_file, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\nMarkdown report saved to: {output_file}")


def main():
    """Main entry point."""

    # Run benchmarks for each configuration with both IGNITION modes
    ignition_results = {}
    alpha_results = {}

    # Extract configurations
    print("Extracting configurations...")
    ignition_config = extract_config(ignition=True)
    alpha_config = extract_config(ignition=False)

    # First, run all configurations with IGNITION=true
    print(f"\n{'='*60}")
    print("Running benchmarks with IGNITION=true")
    print(f"{'='*60}")

    for config_name, config in BENCHMARK_CONFIGS.items():
        print(f"\n{'='*60}")
        print(f"Running benchmark: {config['name']} (IGNITION)")
        print(f"{'='*60}")

        gas_data = run_benchmark_config(config, ignition=True)
        ignition_results[config_name] = gas_data

        # Show summary
        print(f"\nExtracted gas data for {config['name']} (IGNITION):")
        for func_name, data in gas_data.items():
            calldata_info = (
                f", calldata_size={data.get('calldata_size', 'N/A')}"
                if "calldata_size" in data
                else ""
            )
            print(
                f"  - {func_name}: max={data.get('max', 'N/A'):,}, mean={data.get('mean', 'N/A'):,}{calldata_info}"
            )

    # Then, run all configurations with IGNITION=false (Alpha)
    print(f"\n\n{'='*60}")
    print("Running benchmarks with IGNITION=false (Alpha)")
    print(f"{'='*60}")

    for config_name, config in BENCHMARK_CONFIGS.items():
        print(f"\n{'='*60}")
        print(f"Running benchmark: {config['name']} (Alpha)")
        print(f"{'='*60}")

        gas_data = run_benchmark_config(config, ignition=False)
        alpha_results[config_name] = gas_data

        # Show summary
        print(f"\nExtracted gas data for {config['name']} (Alpha):")
        for func_name, data in gas_data.items():
            calldata_info = (
                f", calldata_size={data.get('calldata_size', 'N/A')}"
                if "calldata_size" in data
                else ""
            )
            print(
                f"  - {func_name}: max={data.get('max', 'N/A'):,}, mean={data.get('mean', 'N/A'):,}{calldata_info}"
            )

    # Save raw results
    all_results = {"ignition": ignition_results, "alpha": alpha_results}
    with open("gas_benchmark_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nRaw results saved to: gas_benchmark_results.json")

    # Generate markdown report
    generate_markdown_report(
        ignition_results, alpha_results, ignition_config, alpha_config
    )


if __name__ == "__main__":
    main()
