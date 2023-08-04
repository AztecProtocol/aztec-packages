set -e

VERSION=$(npx semver $1)

echo "Updating Aztec dependencies to version $VERSION"

TMP=$(mktemp)
for PKG in $(jq --raw-output ".dependencies | keys[] | select(contains(\"@aztec/\"))" package.json); do
  jq --arg v $VERSION ".dependencies[\"$PKG\"] = \$v" package.json > $TMP && mv $TMP package.json
done