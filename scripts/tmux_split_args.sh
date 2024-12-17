#!/usr/bin/env bash
set -eu
# Usage: tmux_splits_args.sh <session-name> <main command> <background commands>...
# Runs commands in parallel in a tmux window.
# *Finishes when the main command exits.*

# Check if at least two commands are provided (otherwise what is the point)
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <main-command> <background commands>..."
    exit 1
fi

# Launches tmux with 1 window that has as many panes as commands
session_name=$1

# Kill any existing tmux session with the same name
tmux kill-session -t "$session_name" 2>/dev/null || true

# Start a new tmux session with log level set
tmux new-session -d -s "$session_name" -e LOG_LEVEL=${LOG_LEVEL:-"debug"} \
  -e OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-} \
  -e OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=${OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:-} \
  -e OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-} \
  -e LOG_JSON=${LOG_JSON:-}

shift 1
commands=("$@")

# Set pane-border-status to top and pane-border-format to display pane title
tmux set-option -t "$session_name" pane-border-status top
tmux set-option -t "$session_name" pane-border-format "#{pane_title}"
base_index=$(tmux show-options -g base-index 2>/dev/null | awk '{print $2}')
base_index=${base_index:-0}

echo "Using tmux base_index=$base_index"

# Create the necessary number of panes and set titles
num_commands=${#commands[@]}
for ((i=0; i<num_commands; i++)); do
  if [[ $i -gt 0 ]]; then
    # Split the first pane each time
    tmux split-window -t "$session_name:${base_index}.${base_index}" -h
    tmux select-layout -t "$session_name:${base_index}" tiled
  fi
  # Set the pane title
  tmux select-pane -t "$session_name:${base_index}.$((base_index + i))" -T "${commands[i]}"
done

# Ensure this finishes when pane 0 is finished
tmux set-hook -t "$session_name" pane-exited "if-shell -F '#{==:#{pane_index},0}' 'kill-session -t \"$session_name\"'"

# Now send commands to each pane
for ((i=0; i<num_commands; i++)); do
  tmux send-keys -t "$session_name:$base_index.$((base_index + i))" "${commands[$i]}" C-m
done

# Attach to the session
tmux attach-session -t "$session_name"
