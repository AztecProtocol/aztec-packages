variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "instance_name" {
  description = "Instance name (default: aztec-node)"
  type        = string
  default     = "aztec-node"
}

variable "instance_arch" {
  description = "Instance architecture: x86 (default) or arm"
  type        = string
  default     = "x86"
}

variable "ssh_public_key" {
  description = "SSH public key"
  type        = string
}

variable "l1_private_key" {
  description = "L1 private key for aztec"
  type        = string
}

variable "coinbase" {
  description = "Coinbase public address"
  type        = string
}

variable "api_key" {
  description = "Api key"
  type        = string
}

provider "aws" {
  region = var.aws_region
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu_x86" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_ami" "ubuntu_arm" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "instance_sg" {
  name        = "instance_sg"
  description = "Allow SSH and libp2p ports"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "libp2p TCP"
    from_port   = 40400
    to_port     = 40400
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "libp2p UDP"
    from_port   = 40400
    to_port     = 40400
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "my_key" {
  key_name   = "my_key"
  public_key = var.ssh_public_key
}

resource "aws_eip" "instance_eip" {
  instance = aws_instance.my_instance.id
}

resource "aws_instance" "my_instance" {
  ami                    = var.instance_arch == "arm" ? data.aws_ami.ubuntu_arm.id : data.aws_ami.ubuntu_x86.id
  instance_type          = var.instance_arch == "arm" ? "m7g.large" : "m6a.large"
  subnet_id              = element(data.aws_subnets.default.ids, 0)
  vpc_security_group_ids = [aws_security_group.instance_sg.id]
  key_name               = aws_key_pair.my_key.key_name

  user_data = <<EOF
#!/bin/bash

# Add Docker's official GPG key:
apt-get update
apt-get install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  noble stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update

apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y

usermod -aG docker ubuntu

# Run the Aztec installer as the ubuntu user.
su - ubuntu -c 'VERSION=0.84.0-alpha-testnet.3 NON_INTERACTIVE=1 bash -i <(curl -s https://install.aztec.network)'

cat <<EOT > /etc/systemd/system/aztec.service
[Unit]
Description=Aztec Node Service
After=network.target

[Service]
Environment="L1_PRIVATE_KEY=${var.l1_private_key}"
Environment="COINBASE=${var.coinbase}"
Environment="P2P_IP=$(curl -s https://api.ipify.org)"
Environment="P2P_PORT=40400"
Environment="BLOB_SINK_URL=http://34.82.117.158:5052"
WorkingDirectory=/home/ubuntu
ExecStart=bash -c "/home/ubuntu/.aztec/bin/aztec start --network alpha-testnet --l1-rpc-urls https://json-rpc.1idfjag395jr5mwkdusah7mhr.blockchainnodeengine.com?key=${var.api_key} --l1-consensus-host-urls https://beacon.5dfl92fynpz7pi2buskujxfug.blockchainnodeengine.com --l1-consensus-host-api-keys ${var.api_key} --l1-consensus-host-api-key-headers X-goog-api-key --sequencer.validatorPrivateKey \$L1_PRIVATE_KEY --archiver --node --sequencer"
Restart=always
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
EOT

# Enable and start the service.
systemctl daemon-reload
systemctl enable aztec.service
systemctl start aztec.service
EOF

  tags = {
    Name = "${var.instance_name}-${var.instance_arch}"
  }
}
