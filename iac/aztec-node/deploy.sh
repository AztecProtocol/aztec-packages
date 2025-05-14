#!/bin/bash

REGION=${REGION:-eu-central-1}
ARCH=${ARCH:-x86}

terraform workspace select $REGION || terraform workspace new $REGION
terraform ${1:-apply} \
  -var "aws_region=$REGION" \
  -var "instance_arch=$ARCH" \
  -var "ssh_public_key=$(cat ~/.ssh/authorized_keys | head -1)"
