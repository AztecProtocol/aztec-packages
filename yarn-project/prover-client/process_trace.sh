#!/bin/bash

awk '
/execve/ && /aztec-packages/ {
    # Extract the PID, timestamp, and command
    pid = $1
    match($0, /execve\([^,]+, \[(.+?)\]/, cmd)
    command[pid] = cmd[1]
    sub("/mnt/user-data/charlie/aztec-repos/aztec-packages/", "", command[pid])
    sub(".* ", "", $2)  # Remove the date from timestamp
    start_time[pid] = $2
}

/\+\+\+ exited/ {
    # Extract the PID and timestamp from the exit line
    pid = $1
    if (pid in start_time) {
        sub(".* ", "", $2)  # Remove the date from timestamp
        end_time = $2

        # Calculate the wall-clock time
        split(start_time[pid], start, ":")
        split(end_time, end, ":")
        wall_clock = (end[1] * 3600 + end[2] * 60 + end[3]) - (start[1] * 3600 + start[2] * 60 + start[3])
        if (wall_clock < 0) wall_clock += 86400  # Handle timestamp wrapping across midnight

        # Print in the desired format: [timestamp] [wall-clock-time] [command]
        printf "[%s] [%.3f] [%s]\n", start_time[pid], wall_clock, command[pid]
        delete command[pid]
        delete start_time[pid]
    }
}
' $1

