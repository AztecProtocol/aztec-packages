#!/usr/bin/env python3
import json
import sys
import re

# Counters to be used for extracting benchmark data from JSON files.
TIME_COUNTERS_USED = ["commit(t)", "Goblin::merge(t)"]

# field op weights based on these numbers captured by Kesha (nanoseconds)
#  *      cycle_waste                          :      0.5
#  *      ff_addition                          :      3.8
#  *      ff_from_montgomery                   :     19.1
#  *      ff_invert                            :   7001.3
#  *      ff_multiplication                    :     21.3
#  *      ff_reduce                            :      5.1
#  *      ff_sqr                               :     17.9
#  *      ff_to_montgomery                     :     39.1
#  *      parallel_for_field_element_addition  : 376060.9
#  *      projective_point_accidental_doubling :    347.6
#  *      projective_point_addition            :    348.6
#  *      projective_point_doubling            :    194.2
#  *      scalar_multiplication                :  50060.1
#  *      sequential_copy                      :      3.3

# Cody analyzed the following asm operations as not correlated with one another:
FIELD_OPS_WEIGHTS = {
    "fr::asm_add_with_coarse_reduction": 3.8,
    "fr::asm_conditional_negate": 3.8,
    "fr::asm_mul_with_coarse_reduction": 21.3,
    "fr::asm_self_add_with_coarse_reduction": 3.8,
    "fr::asm_self_mul_with_coarse_reduction": 21.3,
    "fr::asm_self_reduce_once": 3.8,
    "fr::asm_self_sqr_with_coarse_reduction": 21.3,
    "fr::asm_self_sub_with_coarse_reduction": 3.8,
    "fr::asm_sqr_with_coarse_reduction": 21.3,
}

MEMORY_PATTERN = re.compile(r"\(mem: ([\d.]+)MiB\)")

def process_json_field_ops_weighted_sum(benchmark):
    weighted_sum = 0
    for key, weight in FIELD_OPS_WEIGHTS.items():
        if key in benchmark:
            count = int(benchmark[key])
            if count is not None:
                # Calculate the weighted sum of field operations
                weighted_sum += count * weight
    return weighted_sum

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

        field_ops_heuristic = process_json_field_ops_weighted_sum(benchmark)
        if field_ops_heuristic > 0:
            # Add the field ops heuristic to the benchmark entry.
            benchmark["field_ops_heuristic"] = field_ops_heuristic
            results.append({
                "name": "field_ops_heuristic",
                "real_time": field_ops_heuristic,
                "time_unit": "ns"
            })

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
        elif "-ivc.json" in file_path:
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
                print(f"Warning: No memory value found in {file_path}")
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
