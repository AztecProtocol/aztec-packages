terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
  }
}

resource "helm_release" "keystore_setup" {
  name             = "${var.RELEASE_NAME}-setup"
  repository       = "../../"
  chart            = "aztec-keystore"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    yamlencode({
      global = {
        aztecImage = {
          repository = split(":", var.AZTEC_DOCKER_IMAGE)[0]
          tag        = split(":", var.AZTEC_DOCKER_IMAGE)[1]
        }
        kubectlImage = {
          repository = split(":", var.KUBECTL_DOCKER_IMAGE)[0]
          tag        = split(":", var.KUBECTL_DOCKER_IMAGE)[1]
        }
      }
      mnemonic = {
        value = var.MNEMONIC
      }
      attesters = {
        attestersPerNode   = var.ATTESTERS_PER_NODE
        nodeCount          = var.NODE_COUNT
        mnemonicStartIndex = var.VALIDATOR_MNEMONIC_INDEX_START

        addressConfigMap = {
          create = true
          name   = var.ADDRESS_CONFIGMAP_NAME
        }
      }
      publishers = {
        perValidatorKey    = var.ATTESTERS_PER_NODE
        mnemonicStartIndex = var.VALIDATOR_PUBLISHER_MNEMONIC_INDEX_START
      }
      provers = {
        proverCount         = var.PROVER_COUNT
        publishersPerProver = var.PUBLISHERS_PER_PROVER
        mnemonicStartIndex  = var.PROVER_PUBLISHER_MNEMONIC_INDEX_START
      }
    })
  ]

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "helm_release" "web3signer" {
  name             = "${var.RELEASE_NAME}-signer"
  repository       = "https://ethpandaops.github.io/ethereum-helm-charts"
  chart            = "web3signer"
  version          = "1.0.6"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("${path.module}/values/web3signer.yaml"),
    yamlencode({
      chainId = var.CHAIN_ID
      image = {
        repository = split(":", var.WEB3SIGNER_DOCKER_IMAGE)[0]
        tag        = split(":", var.WEB3SIGNER_DOCKER_IMAGE)[1]
      }
      extraVolumes = [
        {
          name = "keystores"
          secret = {
            secretName = "${var.RELEASE_NAME}-setup-keystores"
          }
        }
      ]
      extraVolumeMounts = [
        {
          name      = "keystores"
          mountPath = "/keystore"
        }
      ]
      keystorePath = "/keystore"
    })
  ]

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}
