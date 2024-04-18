# Adapted from https://github.com/actions/actions-runner-controller/blob/master/runner/graceful-stop.sh
#!/bin/bash

set -eu

export RUNNER_ALLOW_RUNASROOT=1
# This should be short so that the job is cancelled immediately, instead of hanging for 10 minutes or so and failing without any error message.
RUNNER_GRACEFUL_STOP_TIMEOUT=${RUNNER_GRACEFUL_STOP_TIMEOUT:-15}

echo "Executing graceful shutdown of github action runners."

# The below procedure atomically removes the runner from GitHub Actions service,
# to ensure that the runner is not running any job.
# This is required to not terminate the actions runner agent while running the job.
# If we didn't do this atomically, we might end up with a rare race where
# the runner agent is terminated while it was about to start a job.

# glob for all our installed runner directories
for RUNNER_DIR in /run/*-ec2-* ; do
  pushd $RUNNER_DIR
  # We need to wait for the registration first.
  # Otherwise a direct runner pod deletion triggered while the runner entrypoint.sh is about to register itself with
  # config.sh can result in this graceful stop process to get skipped.
  # In that case, the pod is eventually and forcefully terminated by ARC and K8s, resulting
  # in the possible running workflow job after this graceful stop process failed might get cancelled prematurely.
  echo "Waiting for the runner to register first."
  while ! [ -f $RUNNER_DIR/.runner ]; do
    sleep 1
  done
  echo "Observed that the runner has been registered."
  RUNNER_TOKEN=$(cat $RUNNER_DIR/.runner-token)
  $RUNNER_DIR/config.sh remove --token "$RUNNER_TOKEN" || true
  popd
done

i=0
echo "Waiting for RUNNER_GRACEFUL_STOP_TIMEOUT=$RUNNER_GRACEFUL_STOP_TIMEOUT seconds until the runner agents stop by themselves."
while [[ $i -lt $RUNNER_GRACEFUL_STOP_TIMEOUT ]]; do
  sleep 1
  if ! pgrep Runner.Listener > /dev/null; then
    echo "The runner agent stopped before RUNNER_GRACEFUL_STOP_TIMEOUT=$RUNNER_GRACEFUL_STOP_TIMEOUT"
    break
  fi
  i=$((i+1))
done

if pgrep Runner.Listener > /dev/null; then
  # The below procedure fixes the runner to correctly notify the Actions service for the cancellation of this runner.
  # It enables you to see `Error: The operation was canceled.` in the worklow job log, in case a job was still running on this runner when the
  # termination is requested.
  #
  # Note though, due to how Actions work, no all job steps gets `Error: The operation was canceled.` in the job step logs.
  # Jobs that were still in the first `Stet up job` step` seem to get `Error: A task was canceled.`,
  #
  # Anyway, without this, a runer pod is "forcefully" killed by any other controller (like cluster-autoscaler) can result in the workflow job to
  # hang for 10 minutes or so.
  # After 10 minutes, the Actions UI just shows the failure icon for the step, without `Error: The operation was canceled.`,
  # not even showing `Error: The operation was canceled.`, which is confusing.
  echo "Sending SIGTERM to the actions runner agent $(pgrep Runner.Listener)."
  kill -TERM $(pgrep Runner.Listener)

  echo "SIGTERM sent. If the runner is still running a job, you'll probably see \"Error: The operation was canceled.\" in its log."
  echo "Waiting for the actions runner agent to stop."
  while pgrep Runner.Listener > /dev/null; do
    sleep 1
  done
fi

echo "Graceful github runner stop completed."