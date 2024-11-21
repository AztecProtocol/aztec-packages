#!/bin/bash

TESTNET_NAME="testnet-2"
terraform init -backend-config="key=deploy-network/${TESTNET_NAME}/terraform.tfstate"
terraform apply -var-file="testnet.tfvars"
