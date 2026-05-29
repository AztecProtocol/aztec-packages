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
        haCount            = var.VALIDATOR_HA_REPLICAS
        mnemonicStartIndex = var.VALIDATOR_MNEMONIC_START_INDEX

        addressConfigMap = {
          create = true
          name   = var.ADDRESS_CONFIGMAP_NAME
        }
      }
      publishers = {
        perReplica         = var.VALIDATOR_PUBLISHERS_PER_REPLICA
        mnemonicStartIndex = var.VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX
      }
      provers = {
        proverCount         = var.PROVER_COUNT
        publishersPerProver = var.PUBLISHERS_PER_PROVER
        mnemonicStartIndex  = var.PROVER_PUBLISHER_MNEMONIC_START_INDEX
      }
    })
  ]

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "helm_release" "web3signer" {
  name             = "${var.RELEASE_NAME}-signer"
  chart            = "${path.module}/web3signer-1.0.6.tgz"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  depends_on = [helm_release.keystore_setup]

  values = [
    file("${path.module}/values/web3signer.yaml"),
    yamlencode({
      chainId = var.CHAIN_ID
      image = {
        repository = split(":", var.WEB3SIGNER_DOCKER_IMAGE)[0]
        tag        = split(":", var.WEB3SIGNER_DOCKER_IMAGE)[1]
      }
      nodeSelector = {
        "node-type" = "network"
      }
      resources = {
        requests = {
          cpu    = "100m"
          memory = "512Mi"
        }
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
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
