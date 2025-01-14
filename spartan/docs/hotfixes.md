# Hotfixes

We need a hotfix if we cut the release branch and then find a bug which is extra small.

1. Create an issue
2. Click create branch
3. _Branch from the release branch_
4. Make changes
5. Create a PR _against the release branch_
6. Merge PR
7. Go [here](https://github.com/AztecProtocol/aztec-packages/actions/workflows/publish-aztec-packages.yml)
8. Click "Run workflow"
   - Use workflow from: `release/adjective-animal`
   - Tag: `aztec-packages-vX.Y.Z` (see note below)
   - Publish: `true`

Note:
If, e.g. the original release was 0.67.0, then keep using that, e.g. `aztec-packages-v0.67.0`
This is safe because the release branch publishes to different tags (like `v0.67.0-devnet` and `adjective-animal`)
