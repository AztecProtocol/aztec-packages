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
