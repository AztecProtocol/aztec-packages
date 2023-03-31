# AZTEC 3 Monorepo

tsconfig management:
To update dependencies, do

- yarn prepare
  from the root folder. This updates tsconfig.dest.json project references, package.json and the build_manifest.json file, all by scanning local project imports ("@aztec/circuits.js" e.g.).
  Note this only handles imports to @aztec/\* packages.

tsconfig is read by the following tools:

- command line ESLint (./tsconfig.dest.json)
- VSCode ESLint (tsconfig.dest.json in the root - linked to yarn-project/tsconfig.json)
- VSCode tsserver (always reads nearest tsconfig.json)
- we excplitiy build with ./tsconfig.dest.json
