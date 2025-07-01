#!/usr/bin/env python3
import json
import sys
import re

# Counters to be used for extracting benchmark data from JSON files.
TIME_COUNTERS_USED = ["commit(t)", "Goblin::merge(t)"]

MEMORY_PATTERN = re.compile(r"\(mem: ([\d.]+)MiB\)")

def extract_memory_from_text(file_path):
    """
    Extracts the last memory value from a text file by searching in reverse order.
    """
    with open(file_path, 'r') as file:
        # Iterate over the file lines in reverse to get the last memory occurrence
        for line in reversed(file.readlines()):
            match = MEMORY_PATTERN.search(line)
            if match:
                return match.group(1)
    return None

def process_json_file(file_path, prefix):
    """
    Processes a JSON file to prefix benchmark names and extract additional counter data.
    """
    # print to stderr
    print(f"Processing JSON file: {file_path}", file=sys.stderr)
    with open(file_path, 'r') as file:
        data = json.load(file)

    results = []
    for benchmark in data['benchmarks']:
        # Prefix the benchmark's name and run name
        benchmark['name'] = f"{prefix}{benchmark['name']}"

        # Include benchmark only if a prefix is provided.
        if prefix != "":
            results.append(benchmark)

        # For each counter, if it exists in the benchmark, create a new entry.
        for counter in TIME_COUNTERS_USED:
            if counter in benchmark:
                results.append({
                    "name": f"{counter}",
                    "real_time": benchmark[counter],
                    "time_unit": "ns"
                })
    return results

def modify_benchmark_data(file_paths):
    """
    Combines benchmark data from multiple files (both text and JSON) with associated prefixes.
    """
    combined_results = {"benchmarks": []}

    for file_path in file_paths:
        prefix = ""
        # Historical name compatibility:
        if "wasm" in file_path:
            prefix = "wasm"
        elif "release" in file_path:
            prefix = "native"
        elif "ivc-" in file_path:
            prefix = "ivc-"
        if file_path.endswith(".txt"):
            # Process text files to extract memory data.
            memory_value = extract_memory_from_text(file_path)
            if memory_value:
                entry = {
                    "name": f"{prefix}UltraHonkVerifierWasmMemory",
                    "real_time": memory_value,
                    "time_unit": "MiB"
                }
                combined_results['benchmarks'].append(entry)
            else:
                print(f"Warning: No memory value found in {file_path}", file=sys.stderr)
        else:
            # Process JSON files to update benchmark entries.
            benchmarks = process_json_file(file_path, prefix)
            combined_results['benchmarks'].extend(benchmarks)
    return combined_results

def main():
    file_paths = sys.argv[1::]
    final_data = modify_benchmark_data(file_paths)

    # Output the combined benchmark data as formatted JSON.
    print(json.dumps(final_data, indent=4))

if __name__ == "__main__":
    main()
