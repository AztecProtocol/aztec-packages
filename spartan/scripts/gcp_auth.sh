#!/usr/bin/env bash

function gcp_auth {
  # if the GCP_PROJECT_ID is set, activate the service account
  if [[ -n "${GCP_PROJECT_ID:-}" && "${CLUSTER}" != "kind" ]]; then
    echo "Activating service account"
    if [[ "${CI:-}" == "1" || "${CI:-}" == "true" ]]; then
      gcloud auth activate-service-account --key-file=$GOOGLE_APPLICATION_CREDENTIALS
    fi
    gcloud config set project "$GCP_PROJECT_ID"
    gcloud container clusters get-credentials ${CLUSTER} --region=${GCP_REGION} --project=${GCP_PROJECT_ID}
  fi
}

# If script is run directly, execute the function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  gcp_auth
fi
