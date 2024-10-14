# For teams

## Install docker

```sh
sudo apt update
sudo apt install docker.io
sudo systemctl start docker
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

## Setup your environment


```sh
export AZTEC_IMAGE=given
export ETHEREUM_HOST=given
export BOOT_NODE_URL=given
export PUBLIC_IP=given
export OTEL_URL=given
```

## When you win a validator


```sh
VALIDATOR_PRIVATE_KEY=given \
VALIDATOR_ADDRESS=given \
NODE_PORT=8080 \
P2P_TCP_PORT=40400 \
P2P_UDP_PORT=40500 \
./deploy-oitavos-team.sh
```

# For operators

Deploy the cluster with
```sh
./deploy-oitavos-spartan.sh aztecprotocol/aztec:someStableImage
```

That is going to add external load balancing services to the `oitavos` namespace.

You need to grab those, and update the values in `oitavos-spartan.yaml` with the new values.

Then cancel the deployment and rerun in order to update the values.

(in a perfect world, the pods would wait and dynamically grab the addresses)

Then go into the `oitavos` namespace and kill the prover node pod so it will restart with the new values.

Then you should be good to go.


