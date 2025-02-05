resource "google_compute_firewall" "allow_inbound_ssh_tcp_udp" {
  name    = "allow-ssh-tcp-udp"
  network = "default"
  # Apply the rule only to instances with the "allow-ssh" tag
  target_tags = ["allow-ssh"]

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443"] # Allow SSH, HTTP, and HTTPS
  }

  allow {
    protocol = "udp"
    ports    = var.udp_ports # Allow specific UDP ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

# 1️⃣ Explicitly deny all other traffic (important for security)
resource "google_compute_firewall" "deny_all_other_traffic" {
  name    = "deny-all-other-traffic"
  network = "default"
  # Apply the rule only to instances with the "allow-ssh" tag
  target_tags = ["allow-ssh"]

  deny {
    protocol = "all"
  }

  # No need to specify source ranges here, this will block everything not explicitly allowed
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "allow_outbound_tcp_udp" {
  name    = "allow-outbound-tcp-udp"
  network = "default"
  # Apply the rule only to instances with the "allow-ssh" tag
  target_tags = ["allow-ssh"]

  allow {
    protocol = "tcp"
    ports    = var.outbound_tcp_ports # Define outbound TCP ports (e.g., 80, 443)
  }

  allow {
    protocol = "udp"
    ports    = var.outbound_udp_ports # Define outbound UDP ports (e.g., DNS, NTP)
  }

  # Outbound traffic is allowed by default, so no need to specify source ranges
  direction = "EGRESS"
}
