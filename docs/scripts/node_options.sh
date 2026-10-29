# Sourced before `yarn build`. Node 25+ defines a localStorage global that warns once per SSG worker when
# Docusaurus copies globals into its render sandbox; the docs never use it. Older Node rejects the flag.
if node --no-experimental-webstorage -e 0 2>/dev/null; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-experimental-webstorage"
fi
