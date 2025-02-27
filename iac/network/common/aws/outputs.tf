output "vm_instance_profile_arn" {
  description = "The ARN of the IAM instance profile"
  value       = module.iam.vm_instance_profile_arn
}

output "vm_instance_profile_name" {
  description = "The name of the IAM instance profile"
  value       = module.iam.vm_instance_profile_name
}

