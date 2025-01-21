#!/bin/bash

# Function to handle cleanup when the script is terminated
cleanup() {
    echo "Initiating cleanup..."

    # Terminate the first yarn serve process (port 8081)
    if kill "$PID1" 2>/dev/null; then
        echo "Killed yarn serve on port 8081 (PID $PID1)."
    else
        echo "No active yarn serve process found on port 8081."
    fi

    # Terminate the second yarn serve process (port 8080)
    if kill "$PID2" 2>/dev/null; then
        echo "Killed yarn serve on port 8080 (PID $PID2)."
    else
        echo "No active yarn serve process found on port 8080."
    fi

    echo "Cleanup completed."
    exit 0
}

# Trap common termination signals and invoke the cleanup function
trap cleanup SIGINT SIGTERM EXIT

# Start the first yarn serve process on port 8081 in the background
yarn serve -n -L -p 8081 --cors -c serve.mt.json "$HOME/.bb-crs" &
PID1=$!
echo "Started yarn serve on port 8081 with PID $PID1."

# Start the second yarn serve process on port 8080 in the background
yarn serve -n -L -p 8080 --cors -c ../serve.mt.json dest &
PID2=$!
echo "Started yarn serve on port 8080 with PID $PID2."

# Function to monitor background processes
monitor_processes() {
    while true; do
        # Check if either process has exited
        if ! kill -0 "$PID1" 2>/dev/null; then
            echo "yarn serve on port 8081 (PID $PID1) has exited."
            cleanup
        fi

        if ! kill -0 "$PID2" 2>/dev/null; then
            echo "yarn serve on port 8080 (PID $PID2) has exited."
            cleanup
        fi

        sleep 1
    done
}

# Start monitoring in the background
monitor_processes &

# Wait indefinitely until a termination signal is received
wait
