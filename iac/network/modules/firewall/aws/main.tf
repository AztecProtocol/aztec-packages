# Security Groups mapped to each VPC dynamically
resource "aws_security_group" "firewall_rules" {
  for_each    = var.vpc_ids # Map of region => VPC ID
  vpc_id      = each.value  # Assign to the correct VPC
  name_prefix = "${each.key}-firewall"
  description = "Security group for ${each.key} VPC"

  # Inbound Rules
  dynamic "ingress" {
    for_each = [
      { from_port = 22, to_port = 22, protocol = "tcp", name = "ssh" },
      { from_port = 80, to_port = 80, protocol = "tcp", name = "http" },
      { from_port = 443, to_port = 443, protocol = "tcp", name = "https" }
    ]
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  # Outbound Rules
  dynamic "egress" {
    for_each = [
      { from_port = 80, to_port = 80, protocol = "tcp", name = "out-http" },
      { from_port = 443, to_port = 443, protocol = "tcp", name = "out-https" }
    ]
    content {
      from_port   = egress.value.from_port
      to_port     = egress.value.to_port
      protocol    = egress.value.protocol
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  tags = {
    Name = "${each.key}-security-group"
  }
}

locals {
  vpc_map = { for k, v in var.vpc_ids : k => v } # Map of region => VPC ID

  # Flattened list of region-port pairs
  region_port_pairs_tcp = flatten([
    for region in keys(local.vpc_map) : [
      for port in var.p2p_tcp_ports : {
        region = region
        port   = port
      }
    ]
  ])

  region_port_pairs_udp = flatten([
    for region in keys(local.vpc_map) : [
      for port in var.p2p_udp_ports : {
        region = region
        port   = port
      }
    ]
  ])
}


# Inbound P2P TCP Ports
resource "aws_security_group_rule" "inbound_p2p_tcp" {
  for_each = { for pair in local.region_port_pairs_tcp : "${pair.region}-${pair.port}" => pair }

  security_group_id = aws_security_group.firewall_rules[each.value.region].id
  type              = "ingress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

# Inbound P2P UDP Ports
resource "aws_security_group_rule" "inbound_p2p_udp" {
  for_each = { for pair in local.region_port_pairs_udp : "${pair.region}-${pair.port}" => pair }

  security_group_id = aws_security_group.firewall_rules[each.value.region].id
  type              = "ingress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
}


# Outbound P2P TCP Ports
resource "aws_security_group_rule" "outbound_p2p_tcp" {
  for_each = { for pair in local.region_port_pairs_tcp : "${pair.region}-${pair.port}" => pair }

  security_group_id = aws_security_group.firewall_rules[each.value.region].id
  type              = "egress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

# Outbound P2P UDP Ports
resource "aws_security_group_rule" "outbound_p2p_udp" {
  for_each = { for pair in local.region_port_pairs_udp : "${pair.region}-${pair.port}" => pair }

  security_group_id = aws_security_group.firewall_rules[each.value.region].id
  type              = "egress"
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
}

