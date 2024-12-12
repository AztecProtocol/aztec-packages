#!/bin/bash
set -eux

MAX_WAIT_TIME=600 # Maximum wait time in seconds, 10 minutes
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

has_none() {
  ! pgrep $1 > /dev/null
}
# We wait to see if a runner comes up in
while has_none Runner.Worker && has_none earthly && has_none docker && has_none clang && has_none cargo && has_none nargo && has_none node; do
  if [ $elapsed_time -ge $MAX_WAIT_TIME ]; then
    echo "Found no work (e.g. docker, earthly, clang, etc) for $MAX_WAIT_TIME, shutting down in two minutes."
    sudo shutdown -P 2
    exit
  fi

  sleep $WAIT_INTERVAL
  elapsed_time=$((elapsed_time + WAIT_INTERVAL))
done
echo "System seems alive, extending life by 10 minutes."
sudo shutdown -P 10