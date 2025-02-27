output "vm_instance_profile_arn" {
  description = "The ARN of the IAM instance profile"
  value       = aws_iam_instance_profile.vm_instance_profile.arn
}

output "vm_instance_profile_name" {
  description = "The name of the IAM instance profile"
  value       = aws_iam_instance_profile.vm_instance_profile.name
}
