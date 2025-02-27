output "private_key_secret" {
  value = module.ssh.private_key_secret
}

output "public_key" {
  value = module.ssh.public_key
}

output "ssh_user" {
  value = module.ssh.ssh_user
}
