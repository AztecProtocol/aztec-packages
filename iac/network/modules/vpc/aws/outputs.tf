output "vpc_ids_by_region" {
  value = { for region, vpc in aws_vpc.vpc :
    region => vpc.id
  }
  description = "List of regions and their corresponding VPCs"
}


output "subnet_ids_by_region" {
  value = { for region, subnet in aws_subnet.subnet :
    region => subnet.id
  }
  description = "List of regions and their corresponding subnets"
}
