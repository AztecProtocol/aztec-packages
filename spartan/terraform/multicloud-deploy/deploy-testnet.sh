#!/bin/bash

TESTNET_NAME="testnet-1"
terraform init -backend-config="key=multicloud-deploy/${TESTNET_NAME}/terraform.tfstate"
terraform apply -var-file="${TESTNET_NAME}.tfvars"
