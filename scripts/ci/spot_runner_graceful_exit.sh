#!/bin/bash

set -eu

export RUNNER_ALLOW_RUNASROOT=1
RUNNER_GRACEFUL_STOP_TIMEOUT=${RUNNER_GRACEFUL_STOP_TIMEOUT:-15}
IDLE_TIME_THRESHOLD=300 # 5 minutes

echo "Monitoring CPU activity to execute graceful shutdown of spot."

# Function to check CPU idle time
check_cpu_idle() {
    local idle_time=0
    while true; do
        # Get idle time from vmstat, field $15 is the idle time percentage
        local current_idle=$(vmstat 1 2 | tail -1 | awk '{print $15}')
        echo "Free CPU: $current_idle%, $idle_time/300 seconds before shutdown"
        if [ "$current_idle" -ge 95 ]; then
            # Increase idle time counter by 1 second
            ((idle_time++)) || true
        else
            echo "Spot instance not idle."
            exit 1
        fi

        # If idle time reaches the threshold, break the loop
        if [ "$idle_time" -ge "$IDLE_TIME_THRESHOLD" ]; then
            break
        fi

        sleep 1
    done
    exit 0
}

# Call the CPU idle check function
if check_cpu_idle ; then
  echo "CPU has been idle for 5 minutes, proceeding with shutdown."
fi