# Deployments

## Overview

1. Sanity check deployment
2. Cut release
3. Deploy networks
4. QA
5. General Availability

## Sanity check deployment

### Masternet

Masternet is deployed from the `master` branch each night. If it died last night, and there hasn't been something to fix the problem, then it is not safe to cut a release.

You can check it by going to [GCP Monitoring](https://console.cloud.google.com/monitoring/dashboards/builder/30d2d0d2-8dd2-4535-8074-e551dbc773aa) and setting the namespace to `masternet`.

Check that everything looks calm, stable, and that the first epoch was proven (you may need to expand the time range).

## Cutting a release

1. Confirm with engineering and product teams that all required PRs are merged.
2. Message in `#product-sequencers-and-provers` that we're good to release, tagging Product and DevRel.
3. After they merge the release please branch for master, create a named release branch (eg: `release/sassy-salamander`) from the desired `master` release (eg:`v0.64.0`).
4. Push this branch to github.

## Build the release images

Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/publish-aztec-packages.yml)

Click "Run workflow".

| Field          | Value                      |
| -------------- | -------------------------- |
| Branch         | `release/adjective-animal` |
| Tag to release | `aztec-packages-v0.64.0`   |
| Publish        | `true`                     |

Adjust the tag to release to the version you're cutting.

Note, this will publish to npm as `v0.64.0-devnet`.

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

| Field                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Use workflow from      | `release/adjective-animal`             |
| Namespace              | `rc1`                                  |
| Values file            | `rc-1.yaml`                            |
| Image                  | `aztecprotocol/aztec:adjective-animal` |
| Secret Name            | `testnet-deployment-mnemonic`          |
| Salt                   | `42`                                   |
| Respect Terraform Lock | `true`                                 |
| Run terraform destroy  | `true`                                 |
| Deploy from branch     | `release/adjective-animal`             |

### Devnet

Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/devnet-deploy.yml).

Click "Run workflow".

| Field                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Use workflow from      | `release/adjective-animal`             |
| Namespace              | `devnet`                               |
| Image                  | `aztecprotocol/aztec:adjective-animal` |
| Secret Name            | `testnet-deployment-mnemonic`          |
| Salt                   | `42`                                   |
| Respect Terraform Lock | `true`                                 |

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

Go to [GCP](https://console.cloud.google.com/kubernetes/workload/overview?hl=en&inv=1&invt=AbkUYg&project=testnet-440309) and see what the problem is.

## QA

The QA process for engineering is to let the `rc` networks run for 72 hours.

After the `rc` networks have been running for an hour or so, message in `#product-sequencers-and-provers` that the thing is up, and notify of when the anticipated GA date/timeis.

If there are any issues, we should create a [hotfix](./hotfixes.md).

This restarts the 72 hour timer, and you should update the message in `#product-sequencers-and-provers` with the new GA date/time.

Once we run for 72 hours, the network is ready for GA.

## General Availability

Make a fresh deployment of the release branch, but in its own namespace.

| Field                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Use workflow from      | `release/adjective-animal`             |
| Namespace              | `adjective-animal`                     |
| Values file            | `rc-X.yaml`                            |
| Image                  | `aztecprotocol/aztec:adjective-animal` |
| Secret Name            | `testnet-deployment-mnemonic`          |
| Salt                   | `42`                                   |
| Respect Terraform Lock | `true`                                 |
| Run terraform destroy  | `true`                                 |
| Deploy from branch     | `release/adjective-animal`             |

The `rc-X.yaml` should be the "best" one that passed QA.

Then update the `spartan/releases/rough-rhino/aztec-spartan.sh` with the new release.

Once that PR is merged, message in `#product-sequencers-and-provers` that the network is ready for GA.

Also in that message, include the ethereum host and bootstrap node for devnet.
