
terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}

provider "aws" {
  region = "eu-west-2"
}

resource "aws_eip" "static_ip" {
  for_each = toset(var.regions)

  tags = {
    Name = "${var.name}-${each.key}"
  }

  lifecycle {
    prevent_destroy = true
  }
}

