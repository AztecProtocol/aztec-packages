output "ip_addresses" {
  value = { for region, ip in google_compute_address.static_ip :
    region => ip.address
  }
  description = "List of regions and their corresponding IP addresses"
}
