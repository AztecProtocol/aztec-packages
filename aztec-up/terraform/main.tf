terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
    key    = "aztec-up"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.29.0"
    }
  }

  required_version = ">= 1.0.0"
}

# Define provider and region
provider "aws" {
  region = var.region
}

# Define region as variable
variable "region" {
  description = "AWS region"
  default     = "eu-west-2"
}

# Define bucket name as variable
variable "bucket_name" {
  description = "The name of the S3 bucket for Aztec install"
  default     = "install.aztec.network"
}

data "terraform_remote_state" "aztec2_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec2/iac"
    region = "eu-west-2"
  }
}

variable "VERSION" {
  description = "The version of the Aztec scripts to upload"
  type        = string
}

# Create the website S3 bucket
resource "aws_s3_bucket" "install_bucket" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_website_configuration" "website_bucket" {
  bucket = aws_s3_bucket.install_bucket.id

  index_document {
    suffix = "aztec-install"
  }
}

resource "aws_s3_bucket_public_access_block" "install_bucket_public_access" {
  bucket = aws_s3_bucket.install_bucket.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "install_bucket_policy" {
  bucket = aws_s3_bucket.install_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.install_bucket.id}/*"
      }
    ]
  })
}

# Upload files to s3 bucket if changes were detected
resource "null_resource" "upload_public_directory" {
  triggers = {
    always_run = "${timestamp()}"
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      # Function to compare versions
      version_gt() { test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"; }

      # Check if AWS CLI is installed
      if ! command -v aws &> /dev/null; then
        echo "AWS CLI not found. Please install it."
        exit 1
      fi

      # Read the current version from S3
      CURRENT_VERSION=$(aws s3 cp s3://${aws_s3_bucket.install_bucket.id}/VERSION - 2>/dev/null || echo "0.0.0")

      # Validate that var.VERSION is a valid semver
      if [[ ! "${var.VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Warning: ${var.VERSION} is not a valid semver version. Skipping version comparison."
      else
        # Check if new version is greater than current version
        if version_gt "${var.VERSION}" "$CURRENT_VERSION"; then
          echo "Uploading new version ${var.VERSION}"

          # Upload new version to root
          aws s3 sync ../bin s3://${aws_s3_bucket.install_bucket.id}/ --delete

          # Update VERSION file
          echo "${var.VERSION}" | aws s3 cp - s3://${aws_s3_bucket.install_bucket.id}/VERSION
        else
          echo "New version ${var.VERSION} is not greater than current version $CURRENT_VERSION. Skipping root upload."
        fi
      fi

      # Always create a version directory and upload files there
      aws s3 sync ../bin s3://${aws_s3_bucket.install_bucket.id}/${var.VERSION}/
    EOT
  }
}

resource "aws_cloudfront_distribution" "install" {
  origin {
    domain_name = aws_s3_bucket.install_bucket.website_endpoint
    origin_id   = "S3-install-aztec-network"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""

  aliases = ["install.aztec.network"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-install-aztec-network"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress              = true
  }

  price_class = "PriceClass_All"

  viewer_certificate {
    acm_certificate_arn      = data.terraform_remote_state.aztec2_iac.outputs.aws_acm_certificate_aztec_network_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2019"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    include_cookies = false
    bucket          = "cloudfront-logs.s3.amazonaws.com"
    prefix          = "install-aztec-network/"
  }
}

resource "aws_route53_record" "install_record" {
  zone_id = data.terraform_remote_state.aztec2_iac.outputs.aws_route53_zone_id
  name    = "install.aztec.network"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.install.domain_name
    zone_id                = aws_cloudfront_distribution.install.hosted_zone_id
    evaluate_target_health = false
  }
}
