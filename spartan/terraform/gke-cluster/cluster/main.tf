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
    channel = "UNSPECIFIED"
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

  resource_usage_export_config {
    enable_network_egress_metering       = true
    enable_resource_consumption_metering = true

    bigquery_destination {
      dataset_id = "egress_consumption"
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
    max_node_count = 512
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
      env       = "production"
      local-ssd = "true"
      node-type = "network"

    }
    tags = ["aztec-gke-node", "aztec"]
  }

  management {
    auto_repair  = true
    auto_upgrade = false
  }
}

# Create 2 core node pool no ssd
resource "google_container_node_pool" "aztec_nodes-2core" {
  name     = "${var.cluster_name}-2core"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 1024
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-2"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env       = "production"
      local-ssd = "false"
      node-type = "network"
    }
    tags = ["aztec-gke-node", "aztec"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = false
  }
}

# Create 4 core node pool no ssd
resource "google_container_node_pool" "aztec_nodes-4core" {
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
      env       = "production"
      local-ssd = "false"
      node-type = "network"
    }
    tags = ["aztec-gke-node", "aztec"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = false
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
      env       = "production"
      pool      = "spot"
      local-ssd = "false"
      node-type = "network"
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
    auto_upgrade = false
  }
}

# Create 8 core spot instance node pool with autoscaling
resource "google_container_node_pool" "spot_nodes_8core" {
  name     = "${var.cluster_name}-8core-spot"
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
    machine_type = "t2d-standard-8"
    spot         = true

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env       = "production"
      pool      = "spot"
      local-ssd = "false"
      node-type = "network"
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
    auto_upgrade = false
  }
}

# Create 2 core spot instance node pool with autoscaling
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
      env       = "production"
      pool      = "spot"
      local-ssd = "false"
      node-type = "network"
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
    auto_upgrade = false
  }
}

# Create 8 core high memory (64 GB) node pool with autoscaling, used for metrics
resource "google_container_node_pool" "infra_nodes_8core_highmem" {
  name     = "${var.cluster_name}-infra-8core-hi-mem"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 4
  }

  # Node configuration
  node_config {
    machine_type = "n2-highmem-8"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env       = "production"
      local-ssd = "false"
      node-type = "infra"
    }
    tags = ["aztec-gke-node"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = false
  }
}

# Create 16 core high memory (128 GB) node pool with autoscaling, used for metrics
resource "google_container_node_pool" "infra_nodes_16core_highmem" {
  name     = "${var.cluster_name}-infra-16core-hi-mem"
  location = var.zone
  cluster  = var.cluster_name
  version  = var.node_version
  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 4
  }

  # Node configuration
  node_config {
    machine_type = "n2-highmem-16"

    service_account = var.service_account
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env       = "production"
      local-ssd = "false"
      node-type = "infra"
    }
    tags = ["aztec-gke-node"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = false
  }
}

