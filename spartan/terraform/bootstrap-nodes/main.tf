provider "google" {
  project = "your-gcp-project-id"
  region  = "us-central1"
}

# 1️⃣ SSH Key Module
module "ssh_key" {
  source      = "./modules/ssh-key"
  ssh_user    = "your-username"
  secret_name = "ssh-private-key"
}

# 2️⃣ VM Instances with Static IPs in Multiple Regions
variable "regions" {
  default = ["us-central1", "europe-west1", "asia-east1"]
}

module "vm_instances" {
  source      = "./modules/vm-instance"
  for_each    = toset(var.regions)
  region      = each.key
  ssh_user    = "your-username"
  public_key  = module.ssh_key.public_key
  private_key = "" # Stored in Secret Manager
}

# 3️⃣ Firewall Rules
module "firewall" {
  source    = "./modules/firewall"
  tcp_ports = ["22", "80", "443"]
  udp_ports = []
}

# 4️⃣ Output the Static Public IPs of all VMs
output "static_ips" {
  value = { for k, v in module.vm_instances : k => v.static_ip }
}
