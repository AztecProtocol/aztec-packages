# Create a GKE cluster
resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.zone

  initial_node_count = 1
  # Remove default node pool after cluster creation
  remove_default_node_pool = true
  deletion_protection      = true

  # Kubernetes version
  min_master_version = var.node_version
  release_channel {
    channel = "STABLE"
  }


  # Network configuration
  network    = "default"
  subnetwork = "default"

  # Master auth configuration
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }
}

# Create 2 core node pool with local ssd
resource "google_container_node_pool" "aztec_nodes_2core_ssd" {
  name     = "${var.cluster_name}-2core-ssd"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version

  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 256
  }

  # Node configuration
  node_config {
    machine_type = "n2d-standard-2"
    ephemeral_storage_local_ssd_config {
      local_ssd_count = 1
    }

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"

    }
    tags = ["aztec-gke-node", "aztec"]
  }
}

# Create 4 core node pool with local ssd
resource "google_container_node_pool" "aztec_nodes_4core_ssd" {
  name     = "${var.cluster_name}-4core-ssd"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 256
  }

  # Node configuration
  node_config {
    machine_type = "n2d-standard-4"
    ephemeral_storage_local_ssd_config {
      local_ssd_count = 1
    }

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"

    }
    tags = ["aztec-gke-node", "aztec"]
  }
}

# Create node pool for simulated aztec nodes (validators, prover nodes, boot nodes)
resource "google_container_node_pool" "aztec_nodes_2core" {
  name     = "${var.cluster_name}-2core"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 256
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-2"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"
    }
    tags = ["aztec-gke-node", "aztec"]
  }
}

# Create node pool for aztec nodes (validators, prover nodes, boot nodes)
resource "google_container_node_pool" "aztec_nodes_4core" {
  name     = "${var.cluster_name}-4core"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 256
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-4"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"
    }
    tags = ["aztec-gke-node", "aztec"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Create 8 core nodes. Usually for proven bots
resource "google_container_node_pool" "aztec_nodes-8core" {
  name     = "${var.cluster_name}-8core"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 256
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-8"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"
    }
    tags = ["aztec-gke-node", "aztec"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Create spot instance node pool with autoscaling
resource "google_container_node_pool" "spot_nodes_32core" {
  name     = "${var.cluster_name}-32core-spot"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 1500
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-32"
    spot         = true

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env  = "production"
      pool = "spot"
    }
    tags = ["aztec-gke-node", "spot"]

    # Spot instance termination handler
    taint {
      key    = "cloud.google.com/gke-spot"
      value  = "true"
      effect = "NO_SCHEDULE"
    }
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Create low core count spot instance node pool with autoscaling
resource "google_container_node_pool" "spot_nodes_2core" {
  name     = "${var.cluster_name}-2core-spot"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 1500
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-2"
    spot         = true

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env  = "production"
      pool = "spot"
    }
    tags = ["aztec-gke-node", "spot"]

    # Spot instance termination handler
    taint {
      key    = "cloud.google.com/gke-spot"
      value  = "true"
      effect = "NO_SCHEDULE"
    }
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}
