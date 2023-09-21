#!/bin/bash
set -eo pipefail

# Build script. If run on Netlify, first it needs to compile all yarn-projects 
# that are involved in typedoc in order to generate their type information.
if [ -n "$NETLIFY" ]; then
  # Move to project root
  cd ..
  echo Working dir $(pwd)

  # Make sure the latest tag is available for loading code snippets from it
  LAST_TAG="aztec-packages-v$(jq -r '.["."]' .release-please-manifest.json)"
  echo Fetching latest released tag $LAST_TAG...
  git fetch origin refs/tags/$LAST_TAG:refs/tags/$LAST_TAG

  # Tweak global tsconfig so we skip tests in all projects
  echo Removing test files from tsconfig...
  jq '. + { "exclude": ["**/*test.ts"] }' yarn-project/tsconfig.json > yarn-project/tsconfig.tmp.json
  mv yarn-project/tsconfig.tmp.json yarn-project/tsconfig.json

  # Install deps (maybe we can have netlify download these automatically so they get cached..?)
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
