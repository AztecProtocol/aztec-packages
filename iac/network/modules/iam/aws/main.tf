# Create an IAM Role for EC2 instances
resource "aws_iam_role" "vm_role" {
  name = var.account_id

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

# Attach the CloudWatch Logs Policy (Equivalent to GCP Logging)
resource "aws_iam_policy_attachment" "logging_policy" {
  name       = "vm-logging-policy-attachment"
  roles      = [aws_iam_role.vm_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# Attach the CloudWatch Metrics Policy (Equivalent to GCP Monitoring)
resource "aws_iam_policy_attachment" "monitoring_policy" {
  name       = "vm-monitoring-policy-attachment"
  roles      = [aws_iam_role.vm_role.name]
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# Create an IAM Instance Profile for EC2
resource "aws_iam_instance_profile" "vm_instance_profile" {
  name = var.account_id
  role = aws_iam_role.vm_role.name
}
