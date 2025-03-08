# Aztec's Build of Noir

We subrepo [noir](https://github.com/noir-lang/noir) into the folder `noir-repo` during the build.
This folder contains dockerfiles and scripts for performing our custom build of noir for the monorepo.

# Syncing with the main Noir repository

In order to keep aztec-packages in step with the main Noir repository we need to periodically sync between them.

Ideally there should be a one-way sync from Noir to aztec-packages, but occasionally, when the `bb` interface changes,
or if some integration test fails and the Noir bug is fixed locally, changes have to go both ways.

## Syncing from Noir to aztec-packages

During the build the Noir repository is cloned or updated according to the contents of the [noir-repo-ref](./noir-repo-ref)
file, which can be a tag, branch name or commit hash. The value can be overriden using the `NOIR_REPO_REF` environment variable,
for example to run the integration tests in aztec-packages against a yet-to-be-released branch of Noir.

If the ref contains a branch, it's pulled with each build triggered by `bootstrap.sh`, but for repeatable builds it should
point at a tag instead or commit instead, which would be updated with a regular PR opened in aztec-packages, so we can run
the test suite before changes take effect.

To start the sync run [this action](https://github.com/AztecProtocol/aztec-packages/actions/workflows/pull-noir.yml) manually (click the "Run Workflow" button in the top right). aztec-bot will then open a new PR which updates the reference. This will might merge conflicts with master which will need to be resolved.

## Syncing from aztec-packages to Noir

When syncing from aztec-packages to Noir it's important to check that the latest release of `bb` uses the same ACIR serialization format as the current master commit. This is because Noir uses a released version of barretenberg rather than being developed in sync with it, it's then not possible to sync if there's been serialization changes since the latest release.

When we make changes in `noir-repo` and commit them, we can check out a branch and push them back to Noir, where a PR can be opened to merge them back
into an appropriate branch (could be `master` or some kind of integration branch). It is important to exclude the [fixup](./scripts/sync-in-fixup.sh) that the local checkout performs from the PR by running the [fixdown](./scripts/sync-out-fixup.sh) script.

Syncing can be postponed by creating a few commits in `noir-repo`, but instead of opening a PR against Noir, creating a [git patch](https://git-scm.com/docs/git-format-patch) instead using, which is committed to aztec-packages and is applied to any subsequent checkout. A patch file can be made using the following command:

```shell
./bootstrap.sh make-patch
```

After this `./noir-repo.patch` should have the changes committed on top of the latest checkout, and if we commit this file to `aztec-packages` then it is automatically applied by any subsequent checkouts of `noir-repo`.

To start an automated sync run [this action](https://github.com/AztecProtocol/aztec-packages/actions/workflows/mirror-noir-subrepo.yml) manually (click the "Run Workflow" button in the top right). aztec-bot will then open a new PR in the `noir-lang/noir` repository which does the initial sync, this will have merge conflicts with master which will need to be resolved.
