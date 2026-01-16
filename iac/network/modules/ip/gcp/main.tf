# Reserve a static public IP
resource "google_compute_address" "static_ip" {
  for_each = toset(var.regions)
  name     = "${var.name}-${each.key}"
  region   = each.key

  lifecycle {
    prevent_destroy = true
  }
}

