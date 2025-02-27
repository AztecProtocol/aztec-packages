resource "aws_vpc" "vpc" {
  for_each = toset(var.regions)

  cidr_block = "10.0.0.0/16"

  tags = {
    Name = "aztec-network-vpc-${each.key}"
  }
}

resource "aws_subnet" "subnet" {
  for_each = toset(var.regions)

  vpc_id            = aws_vpc.vpc[each.key].id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${each.key}a"

  tags = {
    Name = "aztec-network-subnet-${each.key}"
  }
}

