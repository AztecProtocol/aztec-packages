resource "google_compute_firewall" "inbound_bootnode_ssh_firewall" {
  name        = "${var.chain_id}-boot-ssh-fw-in"
  network     = "default"
  target_tags = ["${var.chain_id}-bootnode"]

  allow {
    protocol = "tcp"
    ports    = ["23"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "inbound_bootnode_p2p_firewall" {
  name        = "${var.chain_id}-boot-p2p-fw-in"
  network     = "default"
  target_tags = ["${var.chain_id}-bootnode"]

  allow {
    protocol = "tcp"
    ports    = var.p2p_tcp_ports
  }

  allow {
    protocol = "udp"
    ports    = var.p2p_udp_ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "bootnode_deny_all" {
  name        = "${var.chain_id}-boot-deny-all"
  network     = "default"
  target_tags = ["${var.chain_id}-bootnode"]

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "outbound_bootnode_p2p_firewall" {
  name        = "${var.chain_id}-boot-p2p-fw-out"
  network     = "default"
  target_tags = ["${var.chain_id}-bootnode"]

  allow {
    protocol = "tcp"
    ports    = var.p2p_tcp_ports
  }

  allow {
    protocol = "udp"
    ports    = var.p2p_udp_ports
  }

  direction = "EGRESS"
}
