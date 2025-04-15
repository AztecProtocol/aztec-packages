terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    key    = "spartan-script"
    region = "eu-west-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.29.0"
    }
  }
}

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

resource "aws_s3_bucket" "sp_testnet_script" {
  bucket = "sp-testnet.aztec.network"
}

resource "aws_s3_bucket_website_configuration" "sp_testnet_script" {
  bucket = aws_s3_bucket.sp_testnet_script.id

  index_document {
    suffix = "create-spartan.sh"
  }
}

resource "aws_s3_bucket_public_access_block" "sp_testnet_public_access" {
  bucket = aws_s3_bucket.sp_testnet_script.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "sp_testnet_policy" {
  bucket = aws_s3_bucket.sp_testnet_script.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.sp_testnet_script.id}/*"
      }
    ]
  })
}

# Upload files to s3 bucket
resource "null_resource" "upload_script" {
  triggers = {
    always_run = "${timestamp()}"
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      aws s3 cp ../../releases/create-spartan.sh s3://${aws_s3_bucket.sp_testnet_script.id}/
    EOT
  }
}

resource "aws_cloudfront_distribution" "sp_testnet" {
  origin {
    domain_name = aws_s3_bucket.sp_testnet_script.website_endpoint
    origin_id   = "S3-sp-testnet-aztec-network"

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

  aliases = ["sp-testnet.aztec.network"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-sp-testnet-aztec-network"

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

resource "aws_route53_record" "sp_testnet" {
  zone_id = data.terraform_remote_state.aztec2_iac.outputs.aws_route53_zone_id
  name    = "sp-testnet.aztec.network"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.sp_testnet.domain_name
    zone_id                = aws_cloudfront_distribution.sp_testnet.hosted_zone_id
    evaluate_target_health = false
  }
}
