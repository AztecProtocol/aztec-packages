VERSION=$(cat ../.release-please-manifest.json | jq -r '."."')

echo "Adding latest artifact for version $VERSION"

mkdir -p src/assets/artifacts/$VERSION

cp \
    ../yarn-project/noir-contracts.js/artifacts/sponsored_fpc_contract-SponsoredFPC.json \
    ../yarn-project/noir-contracts.js/artifacts/sponsored_fpc_contract-SponsoredFPC.d.json.ts \
    src/assets/artifacts/$VERSION

echo "Done"
