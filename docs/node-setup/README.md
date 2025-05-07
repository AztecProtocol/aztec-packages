# Aztec Network Sequencer Node Setup Guide

A complete, production-grade guide to run a Sequencer Node on Aztec Network's Testnet, earn the **Apprentice** role, and prepare for validator registration. This guide includes full automation options and troubleshooting for real-world node operation.

---

## 1. Introduction

Aztec is a Layer 2 privacy-focused zk-rollup on Ethereum. Running a node allows you to help secure the network, validate and propose blocks, and participate in the incentive structure.

### Node Roles

* **Sequencer**: Proposes blocks, validates blocks from others, and votes on upgrades.
* **Prover**: Generates ZK proofs (requires powerful data center infrastructure).

> This guide focuses on running a **Sequencer** node.

---

## 2. System Requirements

### Minimum Specs for Sequencer

| Spec       | Minimum (Testnet) | Recommended |
|------------|-------------------|-------------|
| CPU        | 4 cores            | 8+ cores    |
| RAM        | 8 GB               | 16 GB       |
| Disk       | 100 GB SSD         | 100 GB+ SSD |
| OS         | Ubuntu 20.04/22.04 or WSL2 on Windows |
### Recommended VPS Providers

* [Hetzner](https://www.hetzner.com)
* [Contabo](https://contabo.com)
* [DigitalOcean](https://www.digitalocean.com)
* [Racknerd](https://racknerd.com)
* [PQ Hosting](https://pq.hosting/?from=629906)

---

## 3. System Preparation

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt install curl iptables build-essential git wget lz4 jq make gcc nano automake autoconf tmux htop nvme-cli libgbm1 pkg-config libssl-dev libleveldb-dev tar clang bsdmainutils ncdu unzip libleveldb-dev -y
```

---

## 4. Install Docker

Remove old versions:

```bash
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt-get remove $pkg; done
```

Install Docker CE:

```bash
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  \"$(. /etc/os-release && echo \"$VERSION_CODENAME\")\" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update && sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
```

Enable Docker:

```bash
sudo systemctl enable docker
sudo systemctl restart docker
sudo docker run hello-world
```

---

## 5. Install Aztec Tools

```bash
bash -i <(curl -s https://install.aztec.network)
```

After install, restart terminal or run:

```bash
source ~/.bashrc
```

Check if CLI is available:

```bash
aztec
```

---

## 6. Update to Latest Testnet

```bash
aztec-up alpha-testnet
```

---

## 7. RPC & Beacon URLs (Sepolia)

### ‚ö†Ô∏è Free RPCs often cause connection issues.

#### Recommended Paid Providers:

* [Ankr](https://www.ankr.com)
* [Chainstack](https://chainstack.com)
* [QuickNode](https://www.quicknode.com)
* [Blast API](https://blastapi.io)

#### Free Options (Use with Caution):

* [Alchemy](https://alchemy.com) ‚Äì RPC URL
* [Chainstack](https://console.chainstack.com) ‚Äì Beacon URL


![succint (59 4 x 42 cm) (59 x 38 cm) (50 x 35 cm) (39 x 30 cm)](https://github.com/user-attachments/assets/dc504e22-a5c9-471a-8974-bbbac3428ac3)


![3](https://github.com/user-attachments/assets/517ee94c-372a-4007-a728-fb6970f4c2a3)


---

## 8. Wallet Setup & Sepolia ETH

Create an EVM-compatible wallet (MetaMask or CLI).

Save:

* **Public Address**
* **Private Key** (keep secure!)

Get Sepolia ETH from a [faucet](https://sepoliafaucet.com).

---

## 9. Open Firewall Ports

```bash
ufw allow 22
ufw allow 40400
ufw allow 8080
ufw enable
```

---

## 10. Run the Node

Start with `screen` or `tmux`:

```bash
screen -S aztec
```

Main command:

```bash
aztec start --node --archiver --sequencer \
  --network alpha-testnet \
  --l1-rpc-urls <RPC_URL> \
  --l1-consensus-host-urls <BEACON_URL> \
  --sequencer.validatorPrivateKey 0xYOUR_PRIVATE_KEY \
  --sequencer.coinbase 0xYOUR_ADDRESS \
  --p2p.p2pIp YOUR_SERVER_IP \
  --p2p.maxTxPoolSize 1000000000
```

Detach screen:
`Ctrl + A + D`  | Reattach: `screen -r aztec`

---

## 11. Auto-Restart on Boot (Optional)

### Method: Crontab

```bash
crontab -e
```

Add:

```bash
@reboot screen -dmS aztec bash -c 'aztec start --node --archiver --sequencer ...'
```

*(Paste your full command in place of `...`)*

### Systemd Service (Advanced)

This method is more robust than `crontab`, suitable for production deployments.

1. **Create a systemd service file**:

```bash
sudo nano /etc/systemd/system/aztec-node.service
```

2. **Paste and edit this config** (replace values in `<...>`):

```ini
[Unit]
Description=Aztec Sequencer Node
After=network.target docker.service
Requires=docker.service

[Service]
User=<your_linux_username>
WorkingDirectory=/home/<your_linux_username>
ExecStart=/usr/bin/docker run --rm \
  --network host \
  -v ~/.aztec:/root/.aztec \
  aztecprotocol/aztec-node \
  start --node --archiver --sequencer \
  --network alpha-testnet \
  --l1-rpc-urls <RPC_URL> \
  --l1-consensus-host-urls <BEACON_URL> \
  --sequencer.validatorPrivateKey 0x<YOUR_PRIVATE_KEY> \
  --sequencer.coinbase 0x<YOUR_ADDRESS> \
  --p2p.p2pIp <YOUR_SERVER_IP> \
  --p2p.maxTxPoolSize 1000000000

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. **Reload systemd and enable the service**:

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable aztec-node
sudo systemctl start aztec-node
```

4. **Check status**:

```bash
sudo systemctl status aztec-node
```

To see logs:

```bash
journalctl -u aztec-node -f
```


---

## 12. Register on Discord

Get latest proven block:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.number"
```

Generate sync proof:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getArchiveSiblingPath","params":["BLOCK_NUMBER","BLOCK_NUMBER"],"id":67}' \
http://localhost:8080 | jq -r ".result"
```
Below is an Image of a block_number you'd get and how to use it to generate a proof

![succint (59 4 x 42 cm) (59 x 38 cm) (50 x 35 cm) (39 x 30 cm) (1)](https://github.com/user-attachments/assets/ea237851-37aa-4771-a69d-bd63d2d03a71)


Use `/operator start` command in Discord to register.

Submit:
1. Address you used for the node
2. Block_Number
3. Proof

![succint (59 4 x 42 cm) (59 x 38 cm) (50 x 35 cm) (39 x 30 cm)](https://github.com/user-attachments/assets/6b736bce-6e67-4a19-b421-0b4c4fde3b1c)




---

## 13. Register as Validator

```bash
aztec add-l1-validator \
  --l1-rpc-urls <RPC_URL> \
  --private-key 0xYOUR_PRIVATE_KEY \
  --attester 0xYOUR_ADDRESS \
  --proposer-eoa 0xYOUR_ADDRESS \
  --staking-asset-handler 0xF739D03e98e23A7B65940848aBA8921fF3bAc4b2 \
  --l1-chain-id 11155111
```

> Note: Registration is limited to 10 validators/day. Retry if quota is hit.

## 14. Node Health Check
Retrieve your Node‚Äôs Peer ID
```bash
sudo docker logs $(docker ps -q --filter ancestor=aztecprotocol/aztec:alpha-testnet | head -n 1) \
  2>&1 | grep -i "peerId" \
  | grep -o '"peerId":"[^"]*"' \
  | cut -d'"' -f4 \
  | head -n 1
```
‚Ä¢ This outputs your node‚Äôs Peer ID.
‚Ä¢ Paste it into [Nethermind Explorer](https://aztec.nethermind.io/) to verify your node

Validator Registration Stats:
After a successful registration, you can monitor your validator‚Äôs status and performance on [Aztec Scan](https://aztecscan.xyz/validators):


---

## 14. Troubleshooting

### ‚ùå Connected to 0 Peers

* Likely caused by **free RPC issues**
* Switch to a **paid RPC** (Ankr, Chainstack, etc.)

### Ì¥Ñ Sync/Block Hash Error

```bash
rm -rf ~/.aztec/alpha-testnet
```

Restart the node afterward.

### Ì¥ç Node logs

```bash
docker logs --follow $(docker ps -q --filter ancestor=aztecprotocol/aztec-node)
```

---

## 15. Useful Commands Cheat Sheet

```bash
# Reattach screen
screen -r aztec

# Stop screen
Ctrl + C

# Remove node data
rm -rf ~/.aztec/alpha-testnet

# Docker logs
sudo docker ps
sudo docker logs <container_id>

# Restart node
aztec-up alpha-testnet
```

---

## Ì≤¨ Need Help?

* Join [Aztec Discord](https://discord.gg/aztec)
* Check `#operators` and `#node-support` channels

---

**Contributors**: This guide was refined from real-world node experience to go beyond basic setup. Feel free to fork and enhance!
