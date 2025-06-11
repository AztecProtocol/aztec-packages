terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
    key    = "aztec-playground"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.29.0"
    }
  }
}

# Define provider and region.
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

# Create the website S3 bucket
resource "aws_s3_bucket" "playground_bucket" {
  bucket = "play.aztec.network"
}

resource "aws_s3_bucket_website_configuration" "website_bucket" {
  bucket = aws_s3_bucket.playground_bucket.id

  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "playground_bucket_public_access" {
  bucket = aws_s3_bucket.playground_bucket.id

  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "playground_bucket_policy" {
  bucket = aws_s3_bucket.playground_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.playground_bucket.id}/*"
      }
    ]
  })
}

resource "aws_cloudfront_function" "coop_coep_headers" {
  name    = "coop-coep-headers"
  runtime = "cloudfront-js-1.0"
  code    = <<-EOF
    function handler(event) {
      var response = event.response;
      response.headers["cross-origin-embedder-policy"] = { value: "require-corp" };
      response.headers["cross-origin-opener-policy"] = { value: "same-origin" };
      return response;
    }
  EOF
  comment = "Adds COOP and COEP headers to enable shared memory"
}

resource "aws_cloudfront_distribution" "playground" {
  origin {
    domain_name = aws_s3_bucket_website_configuration.website_bucket.website_endpoint
    origin_id   = "S3-play-aztec-network"

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

  aliases = ["play.aztec.network"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-play-aztec-network"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    # viewer_protocol_policy = "redirect-to-https"
    viewer_protocol_policy = "allow-all"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.coop_coep_headers.arn
    }
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

resource "aws_route53_record" "playground_record" {
  zone_id = data.terraform_remote_state.aztec2_iac.outputs.aws_route53_zone_id
  name    = "play.aztec.network"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.playground.domain_name
    zone_id                = aws_cloudfront_distribution.playground.hosted_zone_id
    evaluate_target_health = false
  }
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.playground.id
}
