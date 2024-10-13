# Install docker

```sh
sudo apt update
sudo apt install docker.io
sudo systemctl start docker
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

# Setup your environment


```sh
export AZTEC_IMAGE=given
export ETHEREUM_HOST=given
export BOOT_NODE_URL=given
export PUBLIC_IP=given
```

# When you win a validator


```sh
VALIDATOR_PRIVATE_KEY=given \
VALIDATOR_ADDRESS=given \
NODE_PORT=8080 \
P2P_TCP_PORT=40400 \
P2P_UDP_PORT=40500 \
./deploy-oitavos-team.sh
```


