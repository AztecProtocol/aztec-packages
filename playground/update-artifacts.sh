VERSION=$(git describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null | sed 's/^v//; s/-.*//' || echo "0.0.0")

echo "Adding latest artifact for version $VERSION"

mkdir -p src/assets/artifacts/$VERSION

cp \
    ../yarn-project/noir-contracts.js/artifacts/sponsored_fpc_contract-SponsoredFPC.json \
    ../yarn-project/noir-contracts.js/artifacts/sponsored_fpc_contract-SponsoredFPC.d.json.ts \
    src/assets/artifacts/$VERSION

echo "Done"
