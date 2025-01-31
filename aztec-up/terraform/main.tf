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
}

# Define provider and region
provider "aws" {
  region = "eu-west-2"
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
  bucket = "install.aztec.network"
}

resource "aws_s3_bucket_website_configuration" "website_bucket" {
  bucket = aws_s3_bucket.install_bucket.id

  index_document {
    suffix = "aztec-install"
  }
}

resource "aws_s3_bucket_public_access_block" "install_bucket_public_access" {
  bucket = aws_s3_bucket.install_bucket.id

  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
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
          aws s3 sync ../bin s3://${aws_s3_bucket.install_bucket.id}/

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

    # TODO: Once new aztec-up script (almost certainly within days of this change), switch to redirect-to-https.
    # viewer_protocol_policy = "redirect-to-https"
    viewer_protocol_policy = "allow-all"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
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
