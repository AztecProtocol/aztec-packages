#!/usr/bin/env python3
import subprocess
import json
import heapq

# Get the list of pods
pods = subprocess.check_output(
    ['kubectl', 'get', 'pods', '-n', 'transfer', '-o', 'custom-columns=:metadata.name', '--no-headers'],
    universal_newlines=True
).splitlines()

# Create a min-heap for sorting logs based on timestamp
heap = []

for pod in pods:
    # Get logs for each pod
    logs = subprocess.check_output(['kubectl', 'logs', '-n', 'transfer', pod], universal_newlines=True).splitlines()
    for line in logs:
        # Prefix with pod name
        prefixed_line = f'[{pod}] {line}'
        try:
            # Remove the pod prefix
            if line.startswith('['):
                closing_bracket_index = line.find(']')
                if closing_bracket_index != -1:
                    # Assume there's a space after the closing bracket
                    json_part = line[closing_bracket_index + 2:]
                else:
                    json_part = line  # No closing bracket found
            else:
                json_part = line

            # Parse the JSON part
            log_json = json.loads(json_part)

            # Ensure log_json is a dictionary
            if isinstance(log_json, dict):
                timestamp = log_json.get('timestamp')
                if timestamp:
                    # Use timestamp as the key for sorting
                    heapq.heappush(heap, (timestamp, prefixed_line))
            else:
                # log_json is not a dictionary; skip this line
                continue
        except (json.JSONDecodeError, ValueError, AttributeError) as e:
            # Optionally print the error and the problematic line for debugging
            # print(f"Error parsing line: {line}\nError: {e}")
            continue  # Skip lines that are not valid JSON dictionaries

# Extract and print logs in order
while heap:
    _, log_line = heapq.heappop(heap)
    print(log_line)
