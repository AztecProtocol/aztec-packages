#!/bin/bash
set -eux

MAX_WAIT_TIME=300 # Maximum wait time in seconds
WAIT_INTERVAL=10  # Interval between checks in seconds
elapsed_time=0

exec &> >(tee -a ~/.maybe-exit-log)

# we have this in a minutely crontab for simplicity, but we only want one to run
if [ -f ~/.maybe-exit-spot-lock ] ; then
  echo "Already running maybe_exit_spot.sh"
  exit
fi

exec >~/.maybe-exit-spot-log

cleanup() {
  rm ~/.maybe-exit-spot-lock
}

trap cleanup EXIT
touch ~/.maybe-exit-spot-lock

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
  ~/spot_runner_graceful_exit.sh
  shutdown now
  exit
else
  echo "System seems alive, doing nothing."
fi