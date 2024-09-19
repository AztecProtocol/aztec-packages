# Configure the AWS Provider
provider "aws" {
  region = "us-east-2"  # Change this to your preferred region
}

# Create VPC for EKS
resource "aws_vpc" "spartan_vpc" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name = "spartan-vpc"
  }
}

# Create an internet gateway
resource "aws_internet_gateway" "spartan_igw" {
  vpc_id = aws_vpc.spartan_vpc.id

  tags = {
    Name = "spartan-igw"
  }
}

# Create a subnet
resource "aws_subnet" "spartan_subnet" {
  vpc_id     = aws_vpc.spartan_vpc.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "us-east-2a"  # Change this to match your region

  tags = {
    Name = "spartan-subnet"
  }
}

# Create EKS Cluster
resource "aws_eks_cluster" "spartan_cluster" {
  name     = "spartan-cluster"
  role_arn = aws_iam_role.spartan_cluster_role.arn

  vpc_config {
    subnet_ids = [aws_subnet.spartan_subnet.id]
  }

  depends_on = [aws_iam_role_policy_attachment.spartan_cluster_policy]
}

# Create IAM role for EKS Cluster
resource "aws_iam_role" "spartan_cluster_role" {
  name = "spartan-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

# Attach necessary policies to the EKS Cluster role
resource "aws_iam_role_policy_attachment" "spartan_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.spartan_cluster_role.name
}

# Create EKS Node Group
resource "aws_eks_node_group" "spartan_node_group" {
  cluster_name    = aws_eks_cluster.spartan_cluster.name
  node_group_name = "spartan-node-group"
  node_role_arn   = aws_iam_role.spartan_node_role.arn
  subnet_ids      = [aws_subnet.spartan_subnet.id]

  scaling_config {
    desired_size = 1
    max_size     = 1
    min_size     = 1
  }

  instance_types = ["t4g.2xlarge"]

  depends_on = [
    aws_iam_role_policy_attachment.spartan_worker_node_policy,
    aws_iam_role_policy_attachment.spartan_cni_policy,
    aws_iam_role_policy_attachment.spartan_ecr_policy,
  ]
}

# Create IAM role for EKS Node Group
resource "aws_iam_role" "spartan_node_role" {
  name = "spartan-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Attach necessary policies to the EKS Node role
resource "aws_iam_role_policy_attachment" "spartan_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.spartan_node_role.name
}

resource "aws_iam_role_policy_attachment" "spartan_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.spartan_node_role.name
}

resource "aws_iam_role_policy_attachment" "spartan_ecr_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.spartan_node_role.name
}