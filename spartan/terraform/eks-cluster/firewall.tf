# security_groups.tf

resource "aws_security_group" "node_traffic" {
  name_prefix = "eks-node-traffic"
  description = "Security group for EKS node UDP and TCP traffic"
  vpc_id      = module.vpc.vpc_id # Fixed VPC reference to use the vpc module output

  # Ingress UDP rules
  ingress {
    from_port   = 40400
    to_port     = 40499
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming UDP traffic for original port range"
  }

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming UDP traffic on port 8080"
  }

  ingress {
    from_port   = 8545
    to_port     = 8545
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming UDP traffic on port 8545"
  }

  # Ingress TCP rules
  ingress {
    from_port   = 40400
    to_port     = 40499
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming TCP traffic for original port range"
  }

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming TCP traffic on port 8080"
  }

  ingress {
    from_port   = 8545
    to_port     = 8545
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow incoming TCP traffic on port 8545"
  }

  # Egress UDP rules
  egress {
    from_port   = 40400
    to_port     = 40499
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing UDP traffic for original port range"
  }

  egress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing UDP traffic on port 8080"
  }

  egress {
    from_port   = 8545
    to_port     = 8545
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing UDP traffic on port 8545"
  }

  # Egress TCP rules
  egress {
    from_port   = 40400
    to_port     = 40499
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing TCP traffic for original port range"
  }

  egress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing TCP traffic on port 8080"
  }

  egress {
    from_port   = 8545
    to_port     = 8545
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outgoing TCP traffic on port 8545"
  }

  tags = {
    Name    = "${var.cluster_name}-node-traffic"
    Project = var.cluster_name
  }
}
