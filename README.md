# AZTEC 3 Monorepo

tsconfig management:
To update dependencies, do

- yarn prepare
  from the root folder. This updates tsconfig.dest.json project references and the build_manifest.json file via the references in package.json.
  Note this only handles imports to @aztec/\* packages.

The yarn-project/tsconfig.json file is read by tools that need to understand test files, such as vscode, eslint and jest, while
we build with the per-package tsconfig.dest.json files.
