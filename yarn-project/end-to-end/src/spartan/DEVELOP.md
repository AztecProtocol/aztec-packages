The flow is as follows:

1. Install/start KIND locally
2. Bootstrap (to build an aztec image)
3. Load image into kind
4. Deploy networks
5. Run tests in `yarn-project/end-to-end/src/spartan`

# Setup KIND

KIND is a kubernetes cluster that runs locally out of docker containers.

You can just

```bash
spartan/bootstrap.sh kind
```

You only need to do that once. If you do it again, it will destroy the cluster and recreate it (which you almost never need to do).

Now you’ll likely want some visibility into your cluster. You can

```bash
spartan/scripts/create_k8s_dashboard.sh
```

And after ~30 seconds or so you can

```bash
spartan/scripts/forward_k8s_dashboard.sh
```

That will run a port forward to your port `8443` . If you’re running in a remote environment (e.g. the mainframe), you’ll need to subsequently forward that back to your local machine. Cursor/VSCode have built in port forwarding (cmd/ctrl shift P, “forward”)

Open the forwarded page, and copy/paste the token that was generated when you forwarded the dashboard.

# Build an aztecprotocol:aztec image

```bash
./bootstrap.sh
export AZTEC_DOCKER_IMAGE="aztecprotocol/aztec:$(docker images "aztecprotocol/aztec" --format json | \
  jq -r 'select(.Tag != "latest") | .Tag' | \
  head -1)"
kind load docker-image $AZTEC_DOCKER_IMAGE
```

If you just changed typescript, you can (after the initial bootstrap)

```bash
./yarn-project/bootstrap.sh
./release-image/bootstrap.sh
export AZTEC_DOCKER_IMAGE="aztecprotocol/aztec:$(docker images "aztecprotocol/aztec" --format json | \
  jq -r 'select(.Tag != "latest") | .Tag' | \
  head -1)"
kind load docker-image $AZTEC_DOCKER_IMAGE
```

The export is important there. The `AZTEC_DOCKER_IMAGE` env var is used as both:

- the container that runs the rollup contract deployment
- the containers for the aztec infrastructure (validators, provers, etc)

# Deploy stuff

```bash
./spartan/bootstrap.sh network_deploy scenario.local
```

That will take 1-3 minutes. But at the end you should have everything you need.

You can (`k` is just an alias over `kubectl`)

```bash
❯ k get pods -n scenario
NAME                                              READY   STATUS    RESTARTS   AGE
deploy-rollup-contracts-2025-08-31-1511-w2dlb   0/1     Completed   0          2m34s
scenario-eth-beacon-0                           1/1     Running     0          39m
scenario-eth-execution-0                        1/1     Running     0          39m
scenario-eth-validator-0                        1/1     Running     0          39m
scenario-p2p-bootstrap-node-5cbf9658b9-6vd9b    1/1     Running     0          20m
scenario-prover-agent-59bd96899d-46k5s          1/1     Running     0          116s
scenario-prover-agent-59bd96899d-vzvkd          1/1     Running     0          116s
scenario-prover-broker-0                        1/1     Running     0          116s
scenario-prover-node-0                          1/1     Running     0          116s
scenario-rpc-aztec-node-0                       1/1     Running     0          116s
scenario-validator-0                            1/1     Running     0          116s
scenario-validator-1                            1/1     Running     0          116s
scenario-validator-2                            1/1     Running     0          116s
scenario-validator-3                            1/1     Running     0          116s
```

For example, you can forward back the ethereum node with

```bash
 k port-forward -n scenario services/eth-devnet-eth-execution 8545:8545
```

And then do whatever you like with it.

# Run tests

With the cluster running, you can now easily run tests.

```bash
# run one
./spartan/bootstrap.sh single_test scenario.local spartan/smoke.test.ts

# run all (serially)
./spartan/bootstrap.sh network_tests scenario.local
```

Right now, I recommend running the smoke test first, always, as it waits for the committee to exist.

# Teardown

You can just `k delete namespace scenario`. That will destroy everything in your kind cluster. To destroy the associated terraform state that was stored locally, just `./spartan/terraform/purge_local_state.sh`.
