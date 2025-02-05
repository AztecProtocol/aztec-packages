# 1️⃣ Reserve a static public IP
resource "google_compute_address" "static_ip" {
  name   = "static-ip-${var.region}"
  region = var.region
}

# 2️⃣ Create the VM and assign the static IP
resource "google_compute_instance" "vm" {
  name         = "vm-${var.region}"
  machine_type = "t2d-standard-2"
  zone         = "${var.region}-b"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
    }
  }

  network_interface {
    network = "default"

    # Assign the reserved static IP
    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  metadata = {
    ssh-keys = var.public_key
  }

  # 3️⃣ Install Docker and run an Nginx container
  provisioner "remote-exec" {
    connection {
      type        = "ssh"
      user        = var.ssh_user
      private_key = var.private_key
      host        = google_compute_address.static_ip.address
    }

    inline = [
      "sudo apt update -y",
      "sudo apt install -y docker.io",
      "sudo systemctl start docker",
      "sudo systemctl enable docker",
      "sudo usermod -aG docker $(whoami)",
      "docker run -d -p 80:80 --name webserver nginx"
    ]
  }
}
