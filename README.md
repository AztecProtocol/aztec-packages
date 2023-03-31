# AZTEC 3 Monorepo

To update dependencies, do

- yarn prepare
  from the root folder. This updates tsconfig.dest.json project references, package.json and the build_manifest.json file, all by scanning local project imports ("@aztec/circuits.js" e.g.).
  Note this only handles imports to @aztec/\* packages.
