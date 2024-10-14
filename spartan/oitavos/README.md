# For teams

## Install docker


## Setup your environment

On your local machine, copy the `deploy-oitavos-team.sh` script to the remote machine:
```sh
PEM=given
FILE=/path/to/your/checkout/spartan/oitavos/deploy-oitavos-team.sh
REMOTE=given

scp -i $PEM $FILE ubuntu@$REMOTE:~/deploy.sh
```

Log into the remote machine:
```
ssh -i $PEM ubuntu@$REMOTE
```

Setup docker:

```sh
sudo apt update
sudo apt install docker.io
sudo systemctl start docker
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

Now export some stuff that will remain constant:

```sh
export AZTEC_IMAGE=given
export ETHEREUM_HOST=given
export BOOT_NODE_URL=given
export PUBLIC_IP=given, same as the one you used to ssh
```

Now, whenever you win a validator, you are going to launch a container.
They need to use different ports, and that script will be reading/writing from your `pwd`,
so you want a different dir for each validator.

So when you win validator 1, you can run:

```sh
mkdir val1
cd val1
VALIDATOR_PRIVATE_KEY=0x4c9f2ddf5a2436ba5bb481149e4a7e6c43827d1999b82ae7c66138a768c128cc \
VALIDATOR_ADDRESS=0xaaff72f778ae11740eaf84eafcef3e8bc7446aac \
NODE_PORT=8080 \
P2P_TCP_PORT=40400 \
P2P_UDP_PORT=40500 \
../deploy.sh
```

Note, it doesn't log from the running container.

When you win another validator, you can open a new tab and

```sh
# export the same static vars above
mkdir val2
cd val2
VALIDATOR_PRIVATE_KEY=given \
VALIDATOR_ADDRESS=given \
NODE_PORT=8081 \
P2P_TCP_PORT=40401 \
P2P_UDP_PORT=40501 \
../deploy.sh
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


