#!/bin/bash

RELEASE_NAME="rough-rhino"
terraform init -backend-config="key=deploy-network/${RELEASE_NAME}/terraform.tfstate"
terraform apply -var-file="release.tfvars"
