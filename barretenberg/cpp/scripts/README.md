# Benchmark Barretenberg Remotely

## Why
Aztec engineers usually share computing resources on a mainframe. Its CPU load varies which adds noise to benchmark results.

## Who
To eliminate such noise, we have a machine dedicated to run benchmarks for the Aztec cryptography engineering team.

## What
There are scripts that:
1. Build your target locally, so you do not need to switch branches remotely.
2. `scp` your target to the remote machine.
3. Run your benchmark command remotely.
4. `scp` the benchmark results, usually in json, back to your local machine.
5. Maybe analyze the results.

## Setup & Troubleshooting
1. Ask a crypto eng team member for the private key. Put the key in your mainframe home like `/mnt/user-data/<username>/remote-bb-worker.pem`. Set the permission by `chmod 600 /mnt/user-data/<username>/remote-bb-worker.pem`.
    - Putting the key in your home named like this might allow it to be automatically updated when the machine is reset.
2. Add these to your `~/.zshrc` and restart `zsh`.
    - `export BB_SSH_KEY=-i/mnt/user-data/<username>/remote-bb-worker.pem`
    - `export BB_SSH_INSTANCE=<ASK-A-TEAM-MEMBER-FOR-THE-HOSTNAME>`
    - `export BB_SSH_CPP_PATH=/home/ubuntu/aztec-packages/barretenberg/cpp`
3. Try `ssh $BB_SSH_KEY $BB_SSH_INSTANCE`.
    - If it times out, double check your `$BB_SSH_INSTANCE` with another team member.
    - If you get a permission denied, double check your private key with another team member.
    - If it says the private key is too public, make sure you did `chmod 600 /mnt/user-data/<username>/remote-bb-worker.pem`. You should see `-rw-------` if you `ls -al` the key.
4. If `ssh` worked, the setup is complete.

## How
- `./scripts/benchmark_client_ivc.sh` lets you run `client_ivc_bench` remotely and analyze the results.
- `./scripts/benchmark_example_ivc_flow_remote.sh` copies the example flow input you'd like to run to the remote machine, runs `bb_cli_bench`, and analyze the results.
    - For the script to work you need to have the example flows downloaded locally, by `AZTEC_CACHE_COMMIT=origin/next~3 DOWNLOAD_ONLY=1 yarn-project/end-to-end/bootstrap.sh build_bench`
- If you have other special needs, look inside the above scripts and see what parameters you can give, or use `./scripts/benchmark_remote.sh`.
