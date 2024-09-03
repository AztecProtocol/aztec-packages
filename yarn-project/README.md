# Aztec Typescript Packages

All the Typescript packages that make up [Aztec](https://docs.aztec.network/aztec3/overview).

## Development

All scripts are run in the `yarn-project` workspace root:

- To install dependencies run
```
yarn
```
- To compile all packages on file changes run
```
yarn build:dev
```
- To update `tsconfig.json` and `build_manifest.json` references run
```
yarn prepare
```
- To prettify all files run
```
yarn format
```
- To check prettier and eslint rules on each package (slow) run
```
yarn formatting
```

## Tests

To run tests for a specific package, in its folder just run:

```
yarn test
```

Note that `end-to-end` tests require `anvil` to be running, which is installed as part of the Foundry toolchain.

## Useful extensions

Consider installing the Prettier and ESLint extensions if using VSCode. Configure Prettier to format the code on save, and ensure that ESLint errors are shown in your IDE.

## Typescript config

- `yarn-project/tsconfig.json`: Base tsconfig file, extended by all packages. Used directly by vscode and eslint, where it functions to include the whole project without listing project references.
- `yarn-project/[package]/tsconfig.json`: Each package has its own file that specifies its project reference dependencies. This allows them to be built independently.

## Package.json inheritance

To simplify the management of all package.json files, we have a custom script that injects the contents of `package.common.json` into all packages that reference it via the `inherits` custom field. To run the script, just run

```
yarn prepare
```

To override any of the fields from `package.common.json`, declare a `package.local.json` local to the package and add it to the `inherits` field.

## Adding a new package

To add a new package, make sure to add it to the `build_manifest.json`, to the `workspaces` entry in the root `package.json`, and to the `.circleci/config`. Then, copy the structure from another existing package, including:

- `.eslintrc.cjs`
- `Dockerfile`
- `package.json`
- `README.md`
- `tsconfig.json`

You may also need to modify the [Dockerfile](yarn-project/yarn-project-base/Dockerfile) to copy your new `package.json` into the container to get CI to pass.

## Deploying npm packages
`deploy-npm` script handles the releases of npm packages within yarn-project. But the initial release is a manual process:

1. Ensure relevant folders are copied in by docker in `yarn-project/yarn-project-base/Dockerfile` and `yarn-project/Dockerfile`
2. SSH into the CI
3. Run the following:
```sh
cd project
./build-system/scripts/setup_env "$(git rev-parse HEAD)" "" "" ""
source /tmp/.bash_env*
BUILD_SYSTEM_DEBUG=1
COMMIT_TAG=<RELEASE_TAG_NUMBER_YOU_WANT e.g. aztec-packages-v0.8.8>
```
4. Follow the [`deploy-npm` script](./deploy_npm.sh).
    - Best to run the `deploy_package()` method line by line by manually setting `REPOSITORY` var.
    - Extract `VERSION` as the script shows (in the eg it should be 0.8.8)
    - Skip the version existing checks like `if [ "$VERSION" == "$PUBLISHED_VERSION" ]` and `if [ "$VERSION" != "$HIGHER_VERSION" ]`. Since this is our first time deploying the package, `PUBLISHED_VERSION` and `HIGHER_VERSION` will be empty and hence these checks would fail. These checks are necessary in the CI for continual releases.
    - Locally update the package version in package.json using `jq` as shown in the script
    - Do a dry-run
    - If dry run succeeds, publish the package!
5. Create a PR by adding your package into the `deploy-npm` script so next release onwards, CI can cut releases for your package.
