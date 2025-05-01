# Import the existing bucket with the same settings
resource "google_storage_bucket" "snapshots-bucket" {
    name = "aztec-testnet"
    location = "us-west1"

    autoclass {
        enabled = true
        terminal_storage_class = "ARCHIVE"
    }

    lifecycle_rule {
        action {
            type = "Delete"
        }

        condition {
            num_newer_versions = 3
            with_state = "ARCHIVED"
        }
    }

    lifecycle_rule {
      action {
        type = "Delete"
      }

      condition {
        days_since_noncurrent_time = 15
        with_state = "ANY"
      }
    }
}

# Connect the bucket to the load balancer cdn
resource "google_compute_backend_bucket" "snapshots_backend" {
    name = "aztec-testnet-backend"
    bucket_name = "aztec-testnet"
    enable_cdn = true
}

# URL map to point requests to the backend bucket
resource "google_compute_url_map" "snapshots_cdn_url_map" {
    name = "aztec-testnet-url-map"
    default_service = google_compute_backend_bucket.snapshots_backend.self_link
}

# HTTP Proxy to route requests to the URL map
resource "google_compute_target_http_proxy" "snapshots_cdn_proxy" {
    name = "aztec-testnet-http-proxy"
    url_map = google_compute_url_map.snapshots_cdn_url_map.self_link
}

# Reserve a global IP
resource "google_compute_global_address" "snapshots_cdn_ip" {
    name = "aztec-testnet-cdn-ip"

    lifecycle {
        prevent_destroy = true
    }
}

# Forwarding rule to route traffic to the proxy
resource "google_compute_forwarding_rule" "snapshots_cdn_forwarding_rule" {
    name = "aztec-testnet-cdn-forwarding-rule"
    ip_address = google_compute_global_address.snapshots_cdn_ip.address
    ip_protocol = "TCP"
    target = google_compute_target_http_proxy.snapshots_cdn_proxy.self_link
    port_range = "80"
    load_balancing_scheme = "EXTERNAL_MANAGED"
}

output "cdn_ip" {
    value = google_compute_global_address.snapshots_cdn_ip.address
}

