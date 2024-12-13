# Deployments

## Overview

1. Sanity check deployment
2. Cut release
3. Deploy networks
4. QA
5. Publish release

## Sanity check deployment

### Masternet

### Canary

When you think we should cut a release, you should:

Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/network-deploy.yml).

Click "Run workflow".

| Field                  | Value                         |
| ---------------------- | ----------------------------- |
| Use workflow from      | `master`                      |
| Namespace              | `canary`                      |
| Values file            | `rc-1.yaml`                   |
| Image                  | `aztecprotocol/aztec:master`  |
| Secret Name            | `testnet-deployment-mnemonic` |
| Salt                   | `42`                          |
| Respect Terraform Lock | `true`                        |
| Run terraform destroy  | `true`                        |
| Deploy from branch     | `master`                      |

Make sure it lives.

## Deploy Networks

### Order of deployments:

1. `rc1`
2. `devnet`
3. `rc2` (optional)
4. `exp1` (optional)

It is most important to have a working rc1. Then devnet.

### RC networks

Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/network-deploy.yml).

Click "Run workflow".

| Field                  | Value                         |
| ---------------------- | ----------------------------- |
| Use workflow from      | `release/adjective-animal`    |
| Namespace              | `rc1`                         |
| Values file            | `rc-1.yaml`                   |
| Image                  | `aztecprotocol/aztec:X.Y.Z`   |
| Secret Name            | `testnet-deployment-mnemonic` |
| Salt                   | `42`                          |
| Respect Terraform Lock | `true`                        |
| Run terraform destroy  | `true`                        |
| Deploy from branch     | `release/adjective-animal`    |

### Devnet

Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/devnet-deploy.yml).

Click "Run workflow".

| Field                  | Value                         |
| ---------------------- | ----------------------------- |
| Use workflow from      | `release/adjective-animal`    |
| Namespace              | `devnet`                      |
| Image                  | `aztecprotocol/aztec:X.Y.Z`   |
| Secret Name            | `testnet-deployment-mnemonic` |
| Salt                   | `42`                          |
| Respect Terraform Lock | `true`                        |

### Troubleshooting

#### Terraform lock

If you get an error about the terraform lock, do the following:

1. Ask in `#team-alpha` if anyone is actively working on the network.
2. Go [here](<https://console.cloud.google.com/storage/browser/aztec-terraform/network-deploy/us-west1-a/aztec-gke?pageState=(%22StorageObjectListTable%22:(%22f%22:%22%255B%255D%22))&hl=en&project=testnet-440309>) and just delete the folder for the namespace you're trying to deploy.
3. If you don't have access, and you _need_ to make a release, you can try to re-run the workflow with `Respect Terraform Lock` set to `false`.

#### Helm upgrade in progress

Sometimes a release fails because a helm upgrade is in progress, and sometimes that helm upgrade is busted and is never going to finish.

Ideally, we would just do a helm rollback. (See [here](https://stackoverflow.com/a/65135726)).

But we don't have clean way to do that.

So you can just go [here](<https://console.cloud.google.com/kubernetes/config?hl=en&project=testnet-440309&pageState=(%22config_list_table%22:(%22p%22:0))>) and delete the `sh.helm.release.vX.yournamespace.vX` config map.

Then you can re-run the workflow.

#### Helm install hangs forever
