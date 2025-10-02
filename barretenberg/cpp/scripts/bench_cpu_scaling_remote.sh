#!/bin/bash

# CPU scaling benchmark wrapper that uses benchmark_remote.sh properly
# This script runs a command multiple times with different HARDWARE_CONCURRENCY values
# and tracks the scaling performance of specific BB_BENCH entries
# Uses --bench_out flag to get JSON output for accurate timing extraction

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Parse arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}Usage: $0 \"benchmark_name\" \"command\" [cpu_counts]${NC}"
    echo -e "Example: $0 \"ClientIvcProve\" \"./build/bin/bb prove --ivc_inputs_path input.msgpack --scheme client_ivc\""
    echo -e "Example: $0 \"construct_mock_function_circuit\" \"./build/bin/ultra_honk_bench --benchmark_filter=.*power_of_2.*/15\" \"1,2,4,8\""
    exit 1
fi

BENCH_NAME="$1"
COMMAND="$2"
CPU_LIST="${3:-1,2,4,8,16}"

# Convert comma-separated list to array
IFS=',' read -ra CPU_COUNTS <<< "$CPU_LIST"

# Check if required environment variables are set for remote execution
if [ -z "${BB_SSH_KEY:-}" ] || [ -z "${BB_SSH_INSTANCE:-}" ] || [ -z "${BB_SSH_CPP_PATH:-}" ]; then
    echo -e "${RED}Error: Remote execution requires BB_SSH_KEY, BB_SSH_INSTANCE, and BB_SSH_CPP_PATH environment variables${NC}"
    echo "Please set:"
    echo "  export BB_SSH_KEY='-i /path/to/key.pem'"
    echo "  export BB_SSH_INSTANCE='user@ec2-instance.amazonaws.com'"
    echo "  export BB_SSH_CPP_PATH='/path/to/barretenberg/cpp'"
    exit 1
fi

# Create output directory with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="bench_scaling_remote_${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

# Results file
RESULTS_FILE="$OUTPUT_DIR/scaling_results.txt"
CSV_FILE="$OUTPUT_DIR/scaling_results.csv"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         CPU Scaling Benchmark (Remote Execution)              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Benchmark Entry:${NC} ${YELLOW}$BENCH_NAME${NC}"
echo -e "${CYAN}Command:${NC} $COMMAND"
echo -e "${CYAN}CPU Counts:${NC} ${CPU_COUNTS[@]}"
echo -e "${CYAN}Remote Host:${NC} ${BB_SSH_INSTANCE}"
echo -e "${CYAN}Remote Path:${NC} ${BB_SSH_CPP_PATH}"
echo -e "${CYAN}Output Directory:${NC} $OUTPUT_DIR"
echo ""

# Initialize results file
echo "CPU Scaling Benchmark: $BENCH_NAME" > "$RESULTS_FILE"
echo "Command: $COMMAND" >> "$RESULTS_FILE"
echo "Remote Host: $BB_SSH_INSTANCE" >> "$RESULTS_FILE"
echo "Date: $(date)" >> "$RESULTS_FILE"
echo "================================================" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# Initialize CSV file
echo "CPUs,Time_ms,Time_s,Speedup,Efficiency" > "$CSV_FILE"

# Function to extract time for specific benchmark entry from JSON
extract_bench_time() {
    local json_file=$1
    local bench_name=$2

    # Extract time from JSON file using grep and sed
    # JSON format is: {"benchmark_name": time_in_nanoseconds, ...}
    local time_ns=""
    
    if [ -f "$json_file" ]; then
        # Extract the value for the specific benchmark name from JSON
        time_ns=$(grep -oP "\"${bench_name//\\/\\\\}\":\s*\K\d+" "$json_file" 2>/dev/null | head -1)
    fi
    
    # If JSON extraction failed, try to extract from log file (fallback)
    if [ -z "$time_ns" ] && [ -f "${json_file%/bench.json}/output.log" ]; then
        local log_file="${json_file%/bench.json}/output.log"
        # Try to extract from hierarchical BB_BENCH output
        # Look for pattern like: "  ├─ ClientIvcProve ... 28.13s"
        local time_s=$(grep -E "├─.*${bench_name}" "$log_file" | grep -oP '\d+\.\d+s' | grep -oP '\d+\.\d+' | head -1)
        if [ -n "$time_s" ]; then
            # Convert seconds to nanoseconds
            time_ns=$(awk -v s="$time_s" 'BEGIN{printf "%.0f", s * 1000000000}')
        fi
    fi

    echo "$time_ns"
}

# Store baseline time for speedup calculation
BASELINE_TIME=""

# Arrays to store results
declare -a ALL_CPUS=()
declare -a ALL_TIMES=()
declare -a ALL_SPEEDUPS=()

echo -e "${BLUE}Starting benchmark runs on remote machine...${NC}"
echo ""

# Run benchmark for each CPU count
for cpu_count in "${CPU_COUNTS[@]}"; do
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Running with ${cpu_count} CPU(s)...${NC}"

    # Create output subdirectory
    run_dir="$OUTPUT_DIR/run_${cpu_count}cpus"
    mkdir -p "$run_dir"
    log_file="$run_dir/output.log"

    # Run command on remote machine with specified CPU count
    echo -e "${CYAN}Executing on remote via benchmark_remote.sh...${NC}"
    start_time=$(date +%s.%N)

    # Clean up any stale benchmark file from previous runs on remote
    ssh $BB_SSH_KEY $BB_SSH_INSTANCE "rm -f /tmp/bench_${cpu_count}.json" 2>/dev/null

    # Use benchmark_remote.sh to execute on remote with --bench_out for JSON output
    # The benchmark_remote.sh script handles locking and setup
    # Use tee to show output in real-time AND save to log file
    bench_json_file="$run_dir/bench.json"
    ./scripts/benchmark_remote.sh bb "HARDWARE_CONCURRENCY=$cpu_count $COMMAND --bench_out /tmp/bench_${cpu_count}.json" 2>&1 | tee "$log_file"
    
    # Retrieve the JSON file from remote
    ssh $BB_SSH_KEY $BB_SSH_INSTANCE "cat /tmp/bench_${cpu_count}.json" > "$bench_json_file" 2>/dev/null
    
    # Clean up the remote benchmark file after retrieval
    ssh $BB_SSH_KEY $BB_SSH_INSTANCE "rm -f /tmp/bench_${cpu_count}.json" 2>/dev/null

    end_time=$(date +%s.%N)
    wall_time=$(awk -v e="$end_time" -v s="$start_time" 'BEGIN{printf "%.2f", e-s}')

    # Extract the specific benchmark time from JSON file
    bench_time_ns=$(extract_bench_time "$bench_json_file" "$BENCH_NAME")

    if [ -z "$bench_time_ns" ] || [ "$bench_time_ns" = "0" ]; then
        echo -e "${RED}Warning: Could not extract timing for '$BENCH_NAME' from JSON${NC}"
        echo -e "${YELLOW}Check the JSON file: $bench_json_file${NC}"
        
        # Show what's in the JSON file for debugging
        if [ -f "$bench_json_file" ]; then
            echo -e "${YELLOW}JSON content (first 500 chars):${NC}"
            head -c 500 "$bench_json_file"
            echo ""
        fi
        
        echo "CPUs: $cpu_count - No timing data found" >> "$RESULTS_FILE"
        continue
    fi

    # Convert to milliseconds and seconds
    bench_time_ms=$(awk -v ns="$bench_time_ns" 'BEGIN{printf "%.2f", ns / 1000000}')
    bench_time_s=$(awk -v ns="$bench_time_ns" 'BEGIN{printf "%.3f", ns / 1000000000}')

    # Calculate speedup and efficiency
    if [ -z "$BASELINE_TIME" ]; then
        BASELINE_TIME="$bench_time_ns"
        speedup="1.00"
        efficiency="100.0"
    else
        speedup=$(awk -v base="$BASELINE_TIME" -v curr="$bench_time_ns" 'BEGIN{printf "%.2f", base / curr}')
        efficiency=$(awk -v sp="$speedup" -v cpus="$cpu_count" 'BEGIN{printf "%.1f", (sp / cpus) * 100}')
    fi

    # Store results
    ALL_CPUS+=("$cpu_count")
    ALL_TIMES+=("$bench_time_ms")
    ALL_SPEEDUPS+=("$speedup")

    # Write to results file
    echo "CPUs: $cpu_count" >> "$RESULTS_FILE"
    echo "  Time: ${bench_time_ms} ms (${bench_time_s} s)" >> "$RESULTS_FILE"
    echo "  Speedup: ${speedup}x" >> "$RESULTS_FILE"
    echo "  Efficiency: ${efficiency}%" >> "$RESULTS_FILE"
    echo "  Wall time: ${wall_time}s" >> "$RESULTS_FILE"
    echo "" >> "$RESULTS_FILE"

    # Write to CSV
    echo "$cpu_count,$bench_time_ms,$bench_time_s,$speedup,$efficiency" >> "$CSV_FILE"

    # Display results
    echo -e "${GREEN}✓ Completed${NC}"
    echo -e "  ${CYAN}Time for '$BENCH_NAME':${NC} ${bench_time_ms} ms"
    echo -e "  ${CYAN}Speedup:${NC} ${speedup}x"
    echo -e "  ${CYAN}Efficiency:${NC} ${efficiency}%"
    echo ""
done

# Generate summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                         SUMMARY                               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Print table header
printf "${CYAN}%-8s %-15s %-12s %-12s${NC}\n" "CPUs" "Time (ms)" "Speedup" "Efficiency"
printf "${CYAN}%-8s %-15s %-12s %-12s${NC}\n" "────" "──────────" "───────" "──────────"

# Print results table
for i in "${!ALL_CPUS[@]}"; do
    cpu="${ALL_CPUS[$i]}"
    time="${ALL_TIMES[$i]}"
    speedup="${ALL_SPEEDUPS[$i]}"

    if [ "$i" -eq 0 ]; then
        efficiency="100.0%"
    else
        efficiency=$(awk -v sp="$speedup" -v cpus="$cpu" 'BEGIN{printf "%.1f%%", (sp / cpus) * 100}')
    fi

    # Color code based on efficiency
    if [ "$i" -eq 0 ]; then
        color="${GREEN}"
    else
        eff_val=$(echo "$efficiency" | sed 's/%//')
        if awk -v eff="$eff_val" 'BEGIN {exit !(eff > 75)}'; then
            color="${GREEN}"
        elif awk -v eff="$eff_val" 'BEGIN {exit !(eff > 50)}'; then
            color="${YELLOW}"
        else
            color="${RED}"
        fi
    fi

    printf "${color}%-8s %-15s %-12s %-12s${NC}\n" "$cpu" "$time" "${speedup}x" "$efficiency"
done

echo ""
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Generate scaling plot (ASCII art)
echo -e "${CYAN}Scaling Visualization:${NC}"
echo ""

if [ "${#ALL_TIMES[@]}" -gt 0 ]; then
    # Find max time for scaling
    max_time=$(printf '%s\n' "${ALL_TIMES[@]}" | sort -rn | head -1)

    # Create ASCII bar chart
    for i in "${!ALL_CPUS[@]}"; do
        cpu="${ALL_CPUS[$i]}"
        time="${ALL_TIMES[$i]}"

        # Calculate bar length (max 50 chars)
        bar_len=$(awk -v t="$time" -v m="$max_time" 'BEGIN{printf "%.0f", (t/m) * 50}')

        # Create bar
        bar=""
        for ((j=0; j<bar_len; j++)); do
            bar="${bar}█"
        done

        printf "%-6s │%s %.2f ms\n" "${cpu} CPU" "$bar" "$time"
    done
fi

echo ""
echo -e "${GREEN}Results saved to:${NC}"
echo "  - Summary: $RESULTS_FILE"
echo "  - CSV: $CSV_FILE"
echo "  - Logs: $OUTPUT_DIR/run_*cpus/output.log"
echo ""

# Check for scaling issues
if [ "${#ALL_SPEEDUPS[@]}" -gt 1 ]; then
    last_speedup="${ALL_SPEEDUPS[-1]}"
    last_cpu="${ALL_CPUS[-1]}"
    actual_efficiency=$(awk -v sp="$last_speedup" -v cpus="$last_cpu" 'BEGIN{printf "%.1f", (sp / cpus) * 100}')

    if awk -v eff="$actual_efficiency" 'BEGIN {exit !(eff < 50)}'; then
        echo -e "${YELLOW}⚠ Warning: Poor scaling detected!${NC}"
        echo -e "  At ${last_cpu} CPUs: ${actual_efficiency}% efficiency"
        echo -e "  Consider investigating thread contention or memory bottlenecks."
    elif awk -v eff="$actual_efficiency" 'BEGIN {exit !(eff < 75)}'; then
        echo -e "${YELLOW}Note: Moderate scaling efficiency at high CPU counts.${NC}"
        echo -e "  At ${last_cpu} CPUs: ${actual_efficiency}% efficiency"
    else
        echo -e "${GREEN}✓ Good scaling efficiency maintained!${NC}"
        echo -e "  At ${last_cpu} CPUs: ${actual_efficiency}% efficiency"
    fi
fi

# Clean up all temporary benchmark files on remote
echo -e "${CYAN}Cleaning up remote temporary files...${NC}"
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "rm -f /tmp/bench_*.json" 2>/dev/null

echo ""
