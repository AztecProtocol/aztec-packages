TERRAFORM_DIR=$1
CLUSTER=$2
STATE_PATH=$3

rm -f $TERRAFORM_DIR/backend_override.tf



if [ "${CLUSTER}" == "kind" ]; then
  # For kind, use local backend
  cat > $TERRAFORM_DIR/backend_override.tf << EOF
terraform {
  backend "local" {
    path = "state/${STATE_PATH}/terraform.tfstate"
  }
}
EOF
else
  # For GKE, use GCS backend
  cat > $TERRAFORM_DIR/backend_override.tf << EOF
terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "${STATE_PATH}/terraform.tfstate"
  }
}
EOF
fi
