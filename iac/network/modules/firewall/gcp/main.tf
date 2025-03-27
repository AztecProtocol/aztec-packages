# Just need a global set of firewall rules

resource "google_compute_firewall" "inbound_ssh_rule" {
  name        = "inbound-ssh-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "inbound_http_rule" {
  name        = "inbound-http-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "inbound_https_rule" {
  name        = "inbound-https-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "outbound_http_rule" {
  name        = "outbound-http-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]

  direction = "EGRESS"
}

resource "google_compute_firewall" "outbound_https_rule" {
  name        = "outbound-https-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]

  direction = "EGRESS"
}

resource "google_compute_firewall" "inbound_p2p_tcp_rule" {
  name        = "inbound-p2p-tcp-rule"
  network     = "default"
  target_tags = ["validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = var.p2p_ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "inbound_p2p_udp_rule" {
  name        = "inbound-p2p-udp-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "udp"
    ports    = var.p2p_ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_firewall" "outbound_p2p_tcp_rule" {
  name        = "outbound-p2p-tcp-rule"
  network     = "default"
  target_tags = ["validator"]
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = var.p2p_ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]

  direction = "EGRESS"
}

resource "google_compute_firewall" "outbound_p2p_udp_rule" {
  name        = "outbound-p2p-udp-rule"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 900

  allow {
    protocol = "udp"
    ports    = var.p2p_ports
  }

  # Allow inbound traffic from any IP (0.0.0.0/0)
  source_ranges = ["0.0.0.0/0"]

  direction = "EGRESS"
}

resource "google_compute_firewall" "node_deny_all" {
  name        = "node-deny-all"
  network     = "default"
  target_tags = ["bootnode", "validator"]
  priority    = 1000

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}
