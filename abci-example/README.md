# abci-example

This is an example of a replicated TypeScript application using CometBFT.
It provides scripts that can demonstrate running the application with:

- 128 validator nodes.
- A simple key-value store as the replicated TypeScript application.
- 10ms latency between nodes.
- 60k tx size.
- 10 tps.

The experiments are run on a 128 core aws instance in Frankfurt with 4 high speed nvme drives.
It uses `docker-tc` to perform traffic control between the nodes.

## Future Development

- We want to simulate a large staking set and a randomized 128 validator set for each block.
- We also want "non-validator" nodes. Nodes that are just gossiping txs around the protocol but are never selected to validate.
- Eventually, we could probably run e.g. 8 such machines to give 1024 nodes. 768 could make up the staking set, 256 could just be gossiping.
- The 128 validators and next proposer will be selected using our selection function (in TS right now rather than Solidity).
- We need to "delete" the existing proposer selection and validator set selection/update functionality from comet. Instead at the start of each new height/round, we can query the app for the proposer and validator set. Each node would fetch this from L1. I don't _think_ we need to come to any consensus on this as it's enforced by L1. The comet protocol should then just handle byzantine behavior as it does currently.

## Running

Ensure the test machine is running in AWS Frankfurt. It may already exist with the name like `consensus-tests'.
Do _NOT_ leave the machine running if you're not doing tests. It's a costly machine.

If creating the machine, these are the parameters.

- Region: `eu-central-1 (Frankfurt)`
- Instance type: `m6id.32xlarge`
- OS: `Ubuntu`
- Security group: Pick an existing launch-wizard group, we just need ssh to be open.
- Public IP: Associate the elastic ip `eipalloc-0e17522298db39b18`.

If the machine is fresh you need to:

- Install `docker.io`.
- Add ubuntu user to docker group `sudo usermod -aG docker ubuntu`.
- Modify `/etc/ssh/sshd_config` to have `MaxStartups 100:30:200` and then `sudo service restart sshd`.

Add the consensus test machine to your `~/.ssh/config`:

```
Host consensus
  HostName 52.58.161.110
  IdentityFile ~/.ssh/id_rsa
  User ubuntu
  ControlMaster auto
  ControlPath ~/.ssh/%r@%h-%p
  ControlPersist 600
```

Set `DOCKER_HOST` to point to the consensus test machine. You'll need to do this in each terminal you're working in.

```
$ export DOCKER_HOST=ssh://consensus
```

Clone the cometbft repo somewhere locally (we will later fork this into monorepo):

```
git clone git@github.com:cometbft/cometbft
```

Build the container. By default the cometbft path is `~/github/cometbft`, but you can override it with `CMT_REPO` env var:

```
$ CMT_REPO=~/cometbft ./create_container.sh
```

This will compile cometbft, copy it into the local `./cometbft` dir, and build the new container.

Build the testnet, specifying the number of nodes.
The first 5 nodes are persistent, i.e. all nodes attempt to connect to them.
They have high incoming peer counts to accomodate. (TODO: evolve this to use seed nodes?)
The configuration is copied to the consensus machine, and distributed over the 4 local nvme drives.
Any previously generated data is destroyed first.

```
$ ./create_testnet.sh 128
```

Start the network:

```
$ docker compose up --force-recreate -d
```

Log the output of e.g. node 0:

```
$ scp ./log.sh consensus:. && ssh consensus ./log.sh 0
```

Start injecting transactions:

```
$ scp spam.sh consensus:. && ssh consensus NODES=128 TIME=90 TPS=10 SIZE=40000 ./spam.sh
```

This rotates over 128 nodes, sending 10 tx/s of 40k for 90s.

Shutdown the network:

```
$ docker compose down
```

Re-run the create testnet script to purge the old data and start a fresh testnet.
Remember to shutdown the machine when you're done.
