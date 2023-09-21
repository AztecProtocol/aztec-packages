#!/bin/bash
set -eo pipefail

# Build script. If run on Netlify, first it needs to compile all yarn-projects 
# that are involved in typedoc in order to generate their type information.
if [ -n "$NETLIFY" ]; then
  # Move to project root
  cd ..
  echo Working dir $(pwd)

  # Tweak global tsconfig so we skip tests in all projects
  echo Removing test files from tsconfig...
  jq '. + { "exclude": ["**/*test.ts"] }' yarn-project/tsconfig.json > yarn-project/tsconfig.tmp.json
  mv yarn-project/tsconfig.tmp.json yarn-project/tsconfig.json

  # Install deps
  echo Installing dependencies...
  (cd yarn-project && yarn)

  # Build the required projects for typedoc
  projects=("aztec-rpc" "aztec.js")
  for project in "${projects[@]}"; do
    echo "Building $project..."
    (cd "yarn-project/$project" && yarn build)
  done

  # Back to docs site
  cd docs

  # Install deps
  yarn
fi

# Now build the docsite
echo Building docsite...
yarn preprocess && yarn typedoc && yarn docusaurus build
