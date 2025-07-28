#!/usr/bin/env python3
"""
Generate a flat benchmark JSON file from gas_benchmark_results.json
This replaces the awk script in bootstrap.sh
"""

import json
import sys
from typing import Dict, List, Any


def load_gas_results(filepath: str = "gas_benchmark_results.json") -> Dict[str, Any]:
    """Load the gas benchmark results from JSON file."""
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Could not find {filepath}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)


def load_config(mode: str) -> Dict[str, int]:
    """Load configuration for a specific mode from the test contract."""
    import subprocess
    
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
    
    env = subprocess.os.environ.copy()
    env["IGNITION"] = "true" if mode == "ignition" else "false"
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
                        for log in test_data["decoded_logs"]:
                            if ":" in log:
                                parts = log.split(":", 1)
                                if len(parts) == 2:
                                    key = parts[0].strip()
                                    value = parts[1].strip()
                                    try:
                                        config[key] = int(value)
                                    except ValueError:
                                        pass
        
        return config
    except Exception as e:
        print(f"Warning: Could not extract config for {mode}: {e}")
        return {}


def generate_flat_benchmark_list(gas_results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert the nested gas results into a flat list of benchmark entries."""
    benchmark_list = []
    
    # Load configurations
    alpha_config = load_config("alpha")
    ignition_config = load_config("ignition")
    
    # Process both ignition and alpha results
    for mode, mode_results in gas_results.items():
        for config_name, config_data in mode_results.items():
            for function_name, gas_stats in config_data.items():
                # Rename aggregate3 to proposeAndVote for consistency
                display_function_name = function_name
                if function_name == "aggregate3":
                    display_function_name = "proposeAndVote"
                
                # Create the benchmark entry using mean value
                benchmark_entry = {
                    "name": f"{mode}/{config_name}/{display_function_name}",
                    "value": gas_stats.get("mean", 0),
                    "unit": "gas"
                }
                benchmark_list.append(benchmark_entry)
            
            # Add gas cost per second for all configurations
            if all(func in config_data for func in ["setupEpoch", "propose", "submitEpochRootProof"]):
                config = alpha_config if mode == "alpha" else ignition_config
                if config:
                    slot_duration = config.get("SLOT_DURATION", 36 if mode == "alpha" else 60)
                    epoch_duration = config.get("EPOCH_DURATION", 32 if mode == "alpha" else 48)
                    proofs_per_epoch = config.get("PROOFS_PER_EPOCH", 200) / 100  # Convert from e2 to decimal
                    
                    # Get average gas values
                    setup_epoch_gas = config_data["setupEpoch"].get("mean", 0)
                    propose_gas = config_data["propose"].get("mean", 0)
                    submit_proof_gas = config_data["submitEpochRootProof"].get("mean", 0)
                    
                    # Calculate gas cost per second
                    total_epoch_gas = setup_epoch_gas + (propose_gas * epoch_duration) + (submit_proof_gas * proofs_per_epoch)
                    epoch_duration_seconds = slot_duration * epoch_duration
                    gas_per_second = total_epoch_gas / epoch_duration_seconds if epoch_duration_seconds > 0 else 0
                    
                    # Add gas per second benchmark entry
                    benchmark_entry = {
                        "name": f"{mode}/{config_name}/gasPerSecond",
                        "value": round(gas_per_second, 1),
                        "unit": "gas/second"
                    }
                    benchmark_list.append(benchmark_entry)
    
    return benchmark_list


def save_benchmark_json(benchmark_list: List[Dict[str, Any]], output_file: str = "bench-out/l1-gas.bench.json"):
    """Save the benchmark list to JSON file."""
    # Ensure the output directory exists
    import os
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    with open(output_file, "w") as f:
        json.dump(benchmark_list, f, indent=2)
    print(f"Benchmark JSON saved to: {output_file}")


def main():
    """Main entry point."""
    # Load gas results
    gas_results = load_gas_results()
    
    # Generate flat benchmark list
    benchmark_list = generate_flat_benchmark_list(gas_results)
    
    # Sort the list by name for consistency
    benchmark_list.sort(key=lambda x: x["name"])
    
    # Save to JSON file
    save_benchmark_json(benchmark_list)
    
    # Print summary
    print(f"Generated {len(benchmark_list)} benchmark entries")
    
    # Optionally print the results
    if "--print" in sys.argv:
        print("\nBenchmark entries:")
        for entry in benchmark_list:
            print(f"  {entry['name']}: {entry['value']:,} {entry['unit']}")


if __name__ == "__main__":
    main()