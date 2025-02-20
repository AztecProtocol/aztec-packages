terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}
provider "google" {
  project = var.project_id
  region  = "us-west1"
}

# Reserve a static public IP
resource "google_compute_address" "static_ip" {
  for_each = toset(var.regions)
  name     = "${var.name}-${each.key}"
  region   = each.key
}

