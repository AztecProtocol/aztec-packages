
output "static_ips" {
  value = { for k, v in module.vm_instances : k => v.static_ip }
}

output "ssh_key_outputs" {
  value = data.terraform_remote_state.common.outputs.ssh_key_outputs
}
