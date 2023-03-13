# As we don't yet push .yarn/cache, we need to install.
cd yarn-project
yarn install --immutable
cd ..

# Install yalc, which we will use for in-development packages.
yarn global add yalc

# TODO add other packages that should be built under CI.
for yarn_project in \
  yarn-project/eslint-config \
  yarn-project/aztec.js \
  yarn-project/log \
  yarn-project/key-store \
  yarn-project/wasm-worker
do
  echo "Bootstrapping $yarn_project"
  pushd $yarn_project > /dev/null
  yarn build
  # For development.
  # Publish package to local yalc database.
  # This then lets us call yarn bundle-deps in the submodule repos (e.g. circuits).
  # We can then commit those packages for develoment convenience.
  yalc push
  popd > /dev/null
done
