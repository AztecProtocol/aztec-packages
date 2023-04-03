# AZTEC 3 Monorepo

Package development:

- Run `yarn build:dev` in the root to interactively build the package.
- Run `yarn prepare` in the root to update tsconfig.dest.json and build_manifest.json files based on package.json contents.
  Note this only analyzes package.json imports to @aztec/\* packages.

Repo architecture:

- yarn-project/tsconfig.base.json: Inherited by every tsconfig.json file, except tsconfig.dest.json (as it merely references other tsconfig files).
- yarn-project/tsconfig.json: Used by vscode and eslint. Includes the whole project without listing project references.
- yarn-project/tsconfig.dest.json: Used by `yarn build:dev` in root.
- package/tsconfig.dest.json: Each package has its own file that specifies its project reference dependencies. This allows them to be built independently.
