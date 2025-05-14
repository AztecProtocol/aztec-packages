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

#variable "l1_private_key" {
#  description = "L1 private key for aztec"
#  type        = string
#}
#
#variable "coinbase" {
#  description = "Coinbase public address"
#  type        = string
#}
#
#variable "api_key" {
#  description = "Api key"
#  type        = string
#}

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
    description = "443 TCP"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "8080 TCP"
    from_port   = 8080
    to_port     = 8080
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
  key_name   = "aztec-node-key"
  public_key = var.ssh_public_key
}

resource "aws_eip" "instance_eip" {
  instance = aws_instance.my_instance.id
}

resource "aws_instance" "my_instance" {
  ami                    = var.instance_arch == "arm" ? data.aws_ami.ubuntu_arm.id : data.aws_ami.ubuntu_x86.id
  #ami                    = var.instance_arch == "arm" ? data.aws_ami.ubuntu_arm.id : "ami-0acd5a996a8c66e2c"
  instance_type          = var.instance_arch == "arm" ? "m7g.large" : "m6a.2xlarge"
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
su - ubuntu -c 'VERSION=alpha-testnet NON_INTERACTIVE=1 bash -i <(curl -s https://install.aztec.network)'

cat <<EOT > aztec.service.sh
${file("${path.module}/aztec.service.sh")}
EOT

./aztec.service.sh

cat <<'EOFF' > /home/ubuntu/.bash_profile
# source .bashrc for interactive login shells
if [ -n "$PS1" ] && [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi
EOFF
EOF

  tags = {
    Name = "${var.instance_name}-${var.instance_arch}"
  }
}
