# Remote benchmarking

Benchmarks on the shared mainframe are noisy because its CPU load varies. These scripts build your target locally, copy the binary to a dedicated EC2 machine (the remote bencher) and run your benchmark command there; the output is printed locally.

Other scripts in this folder: see the header comment in each file.

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

Run these from `barretenberg/cpp`.

- `./scripts/chonk_inputs.sh download && ./scripts/ci_benchmark_ivc_flows.sh native` is the shortest local path for a pinned Chonk flow benchmark. The benchmark script defaults to the sponsored `transfer_0` flow and accepts an explicit flow directory as its second argument.
- `./scripts/benchmark_example_ivc_flow_remote.sh` copies the example flow input you'd like to run to the remote machine, runs `bb prove`, and analyze the results.
    - The script downloads the pinned Chonk example flows into `barretenberg/cpp/chonk-pinned-flows` when they are missing or stale.
- If you have other special needs, look inside the above scripts and see what parameters you can give, or use `./scripts/benchmark_remote.sh`.

Chonk proving must always be measured on real example app flows via `benchmark_example_ivc_flow_remote.sh` — there is no synthetic chonk benchmark, and there should not be one. Running synthetic Chonk benchmarks gives misleading numbers because the mock circuits do not reflect production proving costs.
