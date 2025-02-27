output "ip_addresses" {
  value = { for region, eip in aws_eip.static_ip : region => eip.public_ip }
}
