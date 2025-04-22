#!/usr/bin/env bash

# Usage: cmd_split.sh <session-name> [additional args]
# Session will be named after the provided session-name and any additional args

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <session-name> [additional args]"
  exit 1
fi

# Derive session name from all arguments
session="$*"
regions=(eu-central us-west sa-east ap-southeast ca-central)

# Configure pane titles and styling
# Show titles at top of each pane, use pane_title, inactive borders in blue
tmux set-option -g pane-border-status top
tmux set-option -g pane-border-format "#{pane_title}"
tmux set-option -g pane-border-style fg=blue

# If session exists, just attach
tmux has-session -t "$session" 2>/dev/null && tmux attach -t "$session" && exit 0

# Create new detached session with first region command
# Use exec so pane exits when command finishes
tmux new-session -d -s "$session" "./cmd.sh ${regions[0]} ${*}"

# Create vertical splits and run commands directly in them
for region in "${regions[@]:1}"; do
  tmux split-window -h -t "$session" "./cmd.sh $region ${*}"
done

# Arrange panes evenly
tmux select-layout -t "$session" even-vertical

# Attach to the session
tmux attach -t "$session"

