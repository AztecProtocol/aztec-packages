#!/bin/bash
source env.sh
cat <<EOF > /etc/systemd/system/aztec.service
[Unit]
Description=Aztec Node Service
After=network.target
StartLimitBurst=3
StartLimitIntervalSec=3600

[Service]
Environment="L1_PRIVATE_KEY=${L1_PRIVATE_KEY}"
Environment="COINBASE=${COINBASE}"
Environment="P2P_IP=$(curl -s https://api.ipify.org)"
Environment="P2P_PORT=40400"
Environment="BLOB_SINK_URL=http://34.82.117.158:5052"
Environment="PATH=/home/ubuntu/.aztec/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
WorkingDirectory=/home/ubuntu
ExecStart=bash -c "aztec-up alpha-testnet && aztec start --network alpha-testnet --l1-rpc-urls https://json-rpc.1idfjag395jr5mwkdusah7mhr.blockchainnodeengine.com?key=${API_KEY} --l1-consensus-host-urls https://beacon.5dfl92fynpz7pi2buskujxfug.blockchainnodeengine.com --l1-consensus-host-api-keys ${API_KEY} --l1-consensus-host-api-key-headers X-goog-api-key --sequencer.validatorPrivateKey \$L1_PRIVATE_KEY --archiver --node --sequencer"
Restart=on-failure
RestartSec=5
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service.
systemctl daemon-reload
systemctl enable aztec.service
systemctl restart aztec.service
