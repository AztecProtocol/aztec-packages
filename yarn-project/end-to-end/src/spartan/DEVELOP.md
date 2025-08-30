The flow is as follows:

1. Install/start KIND locally
2. Use act to deploy ethereum and aztec onto your local KIND
3. Run tests in `yarn-project/end-to-end/src/spartan`

# setup KIND

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

# deploy stuff

It is good to use the same flows that are run as part of the CI/CD pipeline. To do that, you need https://nektosact.com/introduction.html, which you can install with

```bash
curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

That done, you need to set your config to use the big beefy docker image that most closely resembles what github actions use:

```bash
❯ cat ~/.config/act/actrc
-P ubuntu-latest=catthehacker/ubuntu:full-latest
-P ubuntu-22.04=catthehacker/ubuntu:full-22.04
-P ubuntu-20.04=catthehacker/ubuntu:full-20.04
-P ubuntu-18.04=catthehacker/ubuntu:full-18.04
```

In order to use the flows, you also need https://cli.github.com/

There is a script at `.github/local_workflow.sh` that conveniently wraps `act` . It is helpful to create an alias:

```bash
alias lwfl=/your/path/to/the/repo/.github/local_workflow.sh
```

Now you want to deploy a network, likely based on the copy of the code you have checked out. So you can `./bootstrap.sh`, and then `docker images` and you should see the tag of the most recently created image. Copy the full one (not `latest` or `X.0.0`) and then you can load the image into your kind cluster with

```bash
kind load docker-image aztecprotocol/aztec:yourtag
```

Then, from the repo root, you should be able to simply:

```bash
lwfl deploy_scenario_network \
--input cluster=kind \
--input namespace=scenario \
--input aztec_docker_image=aztecprotocol/aztec:yourtag
```

That will take 1-3 minutes. But at the end you should have everything you need.

You can (`k` is just an alias over `kubectl`)

```bash
❯ k get pods -n scenario
NAME                                              READY   STATUS    RESTARTS   AGE
aztec-infra-p2p-bootstrap-node-5fdf78d979-9wnnb   1/1     Running   0          119m
aztec-infra-prover-agent-7fcc8f5cb8-mhtv2         1/1     Running   0          119m
aztec-infra-prover-agent-7fcc8f5cb8-x4jdh         1/1     Running   0          119m
aztec-infra-prover-broker-0                       1/1     Running   0          119m
aztec-infra-prover-node-0                         1/1     Running   0          119m
aztec-infra-rpc-aztec-node-0                      1/1     Running   0          119m
aztec-infra-validator-0                           1/1     Running   0          119m
aztec-infra-validator-1                           1/1     Running   0          119m
aztec-infra-validator-2                           1/1     Running   0          119m
aztec-infra-validator-3                           1/1     Running   0          119m
eth-devnet-eth-beacon-0                           1/1     Running   0          135m
eth-devnet-eth-execution-0                        1/1     Running   0          135m
eth-devnet-eth-validator-0                        1/1     Running   0          135m

```

For example, you can forward back the ethereum node with

```bash
 k port-forward -n scenario services/eth-devnet-eth-execution 8545:8545
```

And then do whatever you like with it.

# Run tests

With the cluster running, you can now easily run tests.

```bash
cd yarn-project/end-to-end
export AZTEC_REAL_PROOFS=1
export LOG_LEVEL=verbose
export K8S_CLUSTER=kind
export NAMESPACE=scenario
yarn test spartan/smoke.test.ts
yarn test spartan/transfer.test.ts
```

If you make some changes to the image, and want to redeploy, just re-run your bootstrap (I think you might be able to just rebuild the typescript, and then `release-image/bootstrap.sh`), load the new image into kind, and then just rerun the `lwfl` with the new image. It should be fast, since the ethereum network creation, and the rollup contract deployment should do nothing, and just all the aztec pods will roll onto the new version (i.e. using the same L1 rollup contract).

# Teardown

You can just `k delete namespace scenario`. That will destroy everything in your kind cluster. To destroy the associated terraform state that was stored locally, just `./spartan/terraform/purge_local_state.sh`.
