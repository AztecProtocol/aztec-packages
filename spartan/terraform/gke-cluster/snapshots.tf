# Import the existing bucket with the same settings
resource "google_storage_bucket" "snapshots-bucket" {
  name     = "aztec-testnet"
  location = "us-west1"

  logging {
    log_bucket        = "usage_log_bucket"
    log_object_prefix = "aztec-testnet"
  }

  autoclass {
    enabled                = true
    terminal_storage_class = "ARCHIVE"
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = 15
      with_state                 = "ANY"
    }
  }

  # Delete all snapshot db files after 1 week
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = 7
      matches_prefix = ["snapshots/"]
      matches_suffix = [".db"]
    }
  }
}


resource "google_storage_bucket" "snapshots-bucket-mainnet" {
  name     = "aztec-mainnet"
  location = "us-west1"

  uniform_bucket_level_access = true

  logging {
    log_bucket        = "usage_log_bucket"
    log_object_prefix = "aztec-mainnet"
  }

  autoclass {
    enabled                = true
    terminal_storage_class = "ARCHIVE"
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = 15
      with_state                 = "ANY"
    }
  }

  # Delete all snapshot db files after 1 week
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = 7
      matches_prefix = ["snapshots/"]
      matches_suffix = [".db"]
    }
  }
}

