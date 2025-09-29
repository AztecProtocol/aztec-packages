# Branches, releases, etc.

## TLDR

- New stuff goes into `next`
- `v2` was cut from `next` at tag [v3.0.0-nightly.20250906](https://github.com/AztecProtocol/aztec-packages/releases/tag/v3.0.0-nightly.20250906).
- Testnet is running the stack from `v2`
- Mainnet will be running the stack from `v2` (at that point in time), so any node/contract/AVM/circuit/etc changes need to be backported to `v2` if they need to be on mainnet at ignition
- Hotfixes to bugs in prod should go against `v2` immediately
- The `backport-to-v2` label works for "non-urgent" backports from `next`
- `master` should not be used: it is the branch for "old testnet", effectively `v1`
- `v3` will be cut from `next` when we are ready to test release candidates for the alpha upgrade
- Nothing and no one should rely on "latest", especially for testnet: it should be reserved for the stable release on mainnet, but still discouraged.

## next

`next` is the primary development branch. All new work should go into `next` by default.

The current version of a branch can be found in `.release-please-manifest.json`. As of this writing, the version of `next` is `3.0.0`.

Each day at 02:00 UTC, `.github/workflows/nightly-release-tag.yml` runs, which creates a tag like `v3.0.0-nightly.20250919`.

The creation of a tag starting with `v` causes `.github/workflows/ci3.yml` to run.

Since the tag has `-nightly` in it, it runs `bootstrap.sh ci-nightly`.

As part of this, it runs `bootstrap.sh release`, which creates releases to npm/dockerhub/etc with tags like:

- nightly
- 3.0.0-nightly.20250919

## release branches

When we are ready to make a branch to be released, we run the [Create Release Branch](https://github.com/AztecProtocol/aztec-packages/actions/workflows/create-release-branch.yml) workflow.

It requires a commit SHA which SHOULD be one from a particular nightly run.

This creates a new branch for whatever the current version in `next` is, then bumps the version on `next`.

For example, if this were run now, it would create a branch `v3`, and then bump the version in `.release-please-manifest.json` on `next` to be `4.0.0`.

Every push to a release branch causes a new tag to be created via the auto-tag job in .github/workflows/release-please.yml. So as soon as `v3` is created, there will be a tag that is `v3.0.0-rc.1`.

Each `rc` tag causes ci3.yml to run, and creates releases because it runs `bootstrap.sh ci-nightly`.

### master (deprecated)

`master` points at the the version of code which ran the "old" testnet. It should not be updated anymore.

Functionally, it is `v1`.

### v2 (active)

`v2` was cut from `next` at tag [v3.0.0-nightly.20250906](https://github.com/AztecProtocol/aztec-packages/releases/tag/v3.0.0-nightly.20250906).

`.github/workflows/deploy-staging-networks.yml` has been configured to deploy our staging networks when ci3.yml completes on a tag with major version of `2`.

It deploys the following networks:

- staging-public, which is used to test changes before releasing to testnet
- staging-ignition, which is use to test changes before releasing to mainnet

Release-please has been configured on `v2`. When the release-please PR is merged, it creates a clean tag at the next minor version.

For example, at the time of writing, we are at `v2.0.3-rc.4`. When the release please PR is merged, it will create a tag `v2.0.4`.

This will cause ci3.yml to run a release, and then deploy-staging-networks.yml to run and deploy the two networks mentioned above as well as `testnet`.

#### hotfixes

If you are fixing a bug in production, send it into `v2` first.

If you are doing something in `next` we would like in production, you can use the `backport-to-v2` label.

If your change produces new rollup contract addresses or VKs (and so would require a governance upgrade on testnet/mainnet), manually bump the minor version in `.release-please-manifest.json`; e.g., we would presently go to `2.1.0`. We're investigating ways to automate this.

### v3 (planned)

Will be cut when we are ready to start testing release candidates for the alpha upgrade.

## manual releases

One can side-step Release Please automation by updating the version number in the root `.release-please-manifest.json`, committing, tagging the repository with e.g. `v1.2.3`, checking out the tag, and running:

```
./bootstrap.sh release
```

## release image

Aztec is released as a _single_ mono-container. That is, everything we need to ship should end up in `aztecprotocol/aztec` and published to Dockerhub with version tags.

The release image is created from a bootstrap, by the `release-image/Dockerfile`. The `Dockerfile.dockerignore` file ensures that only what's needed is copied into the container. We perform a multi-stage build to first strip back to production dependencies, and copy them into a final slim image.

**It is _extremely_ important we keep this image as lightweight as possible. Do NOT significantly expand the size of this image without very good reason.**
