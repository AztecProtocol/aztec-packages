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
        mnemonicStartIndex = var.MNEMONIC_INDEX_START
        keyStoreSecret = {
          create = true
          name   = "${var.RELEASE_NAME}-keystore"
        }

        addressConfigMap = {
          create = true
          name   = var.ADDRESS_CONFIGMAP_NAME
        }
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
      extraVolumes = [{
        name = "keystore"
        secret = {
          secretName = "${var.RELEASE_NAME}-keystore"
        }
      }]
      extraVolumeMounts = [{
        name      = "keystore"
        mountPath = "/keystore"
      }]
      keystorePath = "/keystore"
    })
  ]

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}
