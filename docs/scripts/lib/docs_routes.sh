# shellcheck shell=bash
# docs_routes - Resolves docs.aztec.network URL paths offline, the way production serves them, from
# the source tree and netlify.toml alone (no build, no install, no network). Source it, then call
# docs_routes_init; DOCS_ROOT defaults to the docs/ directory above this file.
#
#   resolves_locally <path>      a page of the docs version production serves at that path
#   resolves_static <path>       a file under static/, with Netlify pretty URLs
#   resolves_generated <path>    a file every build writes: sitemap, llms files, markdown twins
#   resolves_api_index <path>    a scoped API index the build writes (docs_routes_init_api_indexes
#                                alone sets this one up)
#   matches_any_redirect <path>  a netlify.toml [[redirects]] `from` pattern
#   resolves_url_path <path>     any of the above
#
# A <path> is the request path as a client sends it: percent-encoded (url_encode_path). Netlify
# matches redirects against those bytes, so `from = "/a b.png"` never matches; the file resolvers
# do not decode it.

DOCS_ROOT="${DOCS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
NETLIFY_TOML="${NETLIFY_TOML:-$DOCS_ROOT/netlify.toml}"

function docs_routes_init {
  # Where production serves each docs version, from the map docusaurus.config.js
  # builds its versions from: "<routeBasePath> <path> <version>" per line, "." for
  # the instance root. Cut versions no network reads are served at their name.
  SERVED=$(cd "$DOCS_ROOT" && node -e '
const fs = require("fs");
const { docsInstances } = require("./src/network_docs");
const json = (f, empty) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : empty);
const [developer, operator] = docsInstances(
  json("developer_version_config.json", {}),
  json("network_version_config.json", {}),
  true,
);
for (const [instance, versionsFile] of [[developer, "developer_versions.json"], [operator, "network_versions.json"]]) {
  const mapped = instance.versions.map((v) => v.version);
  for (const v of instance.versions) console.log(instance.routeBasePath, v.path || ".", v.version);
  for (const v of json(versionsFile, []).filter((v) => !mapped.includes(v))) console.log(instance.routeBasePath, v, v);
}
') || { echo "ERROR: could not read the docs version map" >&2; return 1; }

  docs_routes_init_api_indexes || return 1
  docs_routes_init_redirects
}

# The scoped API indexes the build writes (scopedApiIndexes, the list append_api_docs_to_llms.js
# writes): one path under the site root per line.
function docs_routes_init_api_indexes {
  API_INDEXES=$(cd "$DOCS_ROOT" && node -e '
const { docsInstances, scopedApiIndexes } = require("./src/network_docs");
const [developer] = docsInstances(require("./developer_version_config.json"), require("./network_version_config.json"), true);
for (const index of scopedApiIndexes(developer, "static")) console.log(index);
') || { echo "ERROR: could not read the scoped API indexes" >&2; return 1; }
}

# A scoped API index the build writes, so it is never under static/ (docs_routes_init_api_indexes).
function resolves_api_index {
  grep -qxF -- "${1#/}" <<<"$API_INDEXES"
}

function docs_routes_init_redirects {
  [[ -r "$NETLIFY_TOML" ]] || { echo "ERROR: cannot read $NETLIFY_TOML" >&2; return 1; }
  # A multi-line string's body can hold a line that reads as a `from` key, and only a full TOML
  # lexer could tell, so such a file is refused rather than read.
  if grep -qE "\"\"\"|'''" "$NETLIFY_TOML"; then
    echo "ERROR: $NETLIFY_TOML holds a multi-line string (\"\"\" or '''); write the value on one line" >&2
    return 1
  fi
  REDIRECT_FROMS=()
  local line
  while IFS= read -r line; do REDIRECT_FROMS+=("$line"); done < <(redirect_froms "$NETLIFY_TOML")

  REDIRECT_REGEXES=()
  local from
  for from in ${REDIRECT_FROMS[@]+"${REDIRECT_FROMS[@]}"}; do
    REDIRECT_REGEXES+=("$(from_to_regex "$from")")
  done
}

# Prints the `from` of each [[redirects]] table. Any other table header ends one, its own
# subtables ([redirects.headers]) included, whose keys are not redirects. Only a one-line basic
# string without escapes is read: a rule in another form is missed, which can only fail a check.
# Assumes no multi-line strings (docs_routes_init_redirects refuses them).
function redirect_froms {
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*\[/ {
      header = $0
      sub(/#.*/, "", header)
      gsub(/[[:space:]]/, "", header)
      in_redirect = (header == "[[redirects]]")
      next
    }
    in_redirect && /^[[:space:]]*from[[:space:]]*=[[:space:]]*"[^"\\]*"[[:space:]]*(#.*)?$/ {
      value = $0
      sub(/^[^"]*"/, "", value)
      print substr(value, 1, index(value, "\"") - 1)
    }
  ' "$1"
}

# Converts a netlify `from` into an extended regex, segment by segment, as the redirect engine
# reads it: a `*` segment matches zero or more segments, a `:<name>` segment exactly one; a `*`
# or `:` anywhere else is literal. Trailing slashes are dropped from the pattern, and the path may
# end in one. A `from` without a leading slash also matches with one.
function from_to_regex {
  local from="$1" rooted=1 escaped re="" seg segs=()
  [[ "$from" == /* ]] || rooted=0
  from="${from#/}"
  while [[ "$from" == */ ]]; do from="${from%/}"; done
  escaped=$(printf '%s' "$from" | sed -E 's/[][\\.^$+?{}()|*]/\\&/g')
  [[ -z "$escaped" ]] || IFS=/ read -r -a segs <<<"$escaped"
  # The ${a[@]+...} form: bash 3.2 (macOS) treats an empty array as unset under `set -u`.
  for seg in ${segs[@]+"${segs[@]}"}; do
    if [[ "$seg" == '\*' ]]; then
      re+='(/.*)?'
    elif [[ "$seg" == :?* ]]; then
      re+='/[^/]+'
    else
      re+="/$seg"
    fi
  done
  ((rooted)) || re="/?${re#/}"
  echo "^${re}/?\$"
}

# Percent-encodes a path the way a browser requests it (the WHATWG URL path percent-encode set,
# as Node's URL implements it), plus % # ? \, which a file name can only be requested through.
# Hex is uppercase: Netlify compares bytes, so %c3 and %C3 differ.
function url_encode_path {
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in
      [-A-Za-z0-9/._~!\$\&\'\(\)*+,\;=:@\[\]\|]) out+=$c ;;
      *)
        printf -v c '%%%02X' "'$c"
        out+=$c
        ;;
    esac
  done
  printf '%s\n' "$out"
}

# Matches redirect sources only; validate_redirect_targets.sh checks non-wildcard targets.
function matches_any_redirect {
  local url_path="$1"
  for re in "${REDIRECT_REGEXES[@]}"; do
    if [[ "$url_path" =~ $re ]]; then
      return 0
    fi
  done
  return 1
}

# Prints "<key>: <value>" for the id, slug and draft keys of the front matter block that opens a
# file, without quotes or a trailing YAML comment. A later `---` (a rule in the body) is not front matter.
function front_matter {
  local key value
  while read -r key value; do
    value=${value%%[[:space:]]\#*}
    value=${value#[\"\']}
    value=${value%[\"\']}
    echo "$key $value"
  done < <(sed -nE '1{/^---$/!q;d;}; /^---$/q; s/^(id|slug|draft):[[:space:]]*/\1: /p' "$1")
}

function is_draft {
  local key value
  while read -r key value; do
    [[ "$key" == draft: && "$value" == true ]] && return 0
  done < <(front_matter "$1")
  return 1
}

# The last URL segment Docusaurus serves a docs file at: its `id`, else its file name without a
# number prefix. Prints nothing for a draft (dropped from builds) or a file with a `slug`.
function doc_route_name {
  local file="$1" key value id="" name
  while read -r key value; do
    case "$key" in
      slug:) return 0 ;;
      draft:) [[ "$value" == true ]] && return 0 ;;
      id:) id=$value ;;
    esac
  done < <(front_matter "$file")
  name=${file##*/}
  name=${name%.*}
  [[ "$name" =~ ^[0-9]+[-_.](.+)$ ]] && name=${BASH_REMATCH[1]}
  echo "${id:-$name}"
}

function serves_index {
  local file
  for file in "$1/index.md" "$1/index.mdx"; do
    [[ -f "$file" ]] && ! is_draft "$file" && return 0
  done
  return 1
}

# Whether a Docusaurus docs directory serves <sub_path>: a directory index, or a file whose route
# name (doc_route_name) is the last segment. Partials (`_` names) and index files are served at no
# name of their own.
function check_file_or_id {
  local base_dir="$1" sub_path="$2"
  if [[ -z "$sub_path" ]]; then
    serves_index "$base_dir"
    return
  fi
  [[ "/$sub_path" == */_* || "/$sub_path" == */index ]] && return 1
  [[ -d "$base_dir/$sub_path" ]] && serves_index "$base_dir/$sub_path" && return 0

  local dir="$base_dir" slug="$sub_path" file name ext
  if [[ "$sub_path" == */* ]]; then
    dir="$base_dir/${sub_path%/*}"
    slug=${sub_path##*/}
  fi
  for ext in md mdx; do
    file="$dir/$slug.$ext"
    [[ -f "$file" && "$(doc_route_name "$file")" == "$slug" ]] && return 0
  done
  [[ -d "$dir" ]] || return 1
  for file in "$dir"/*.md "$dir"/*.mdx; do
    [[ -f "$file" ]] || continue
    name=${file##*/}
    [[ "$name" == _* || "${name%.*}" == index ]] && continue
    [[ "$(doc_route_name "$file")" == "$slug" ]] && return 0
  done
  return 1
}

# Resolves the rest of a /developers or /operate URL against the docs version
# served at its longest matching path; the root falls back to the source tree
# when no snapshot is mapped.
function resolves_in_instance {
  local base="$1" rest="$2" prefix=developer source=docs-developers
  [[ "$base" == operate ]] && prefix=network source=docs-operate
  local b p v root=""
  while read -r b p v; do
    [[ "$b" == "$base" ]] || continue
    if [[ "$p" == . ]]; then
      root=$v
    elif [[ "$rest" == "$p" || "$rest" == "$p"/* ]]; then
      rest=${rest#"$p"}
      check_file_or_id "$DOCS_ROOT/${prefix}_versioned_docs/version-$v" "${rest#/}"
      return
    fi
  done <<<"$SERVED"
  if [[ -n "$root" && -d "$DOCS_ROOT/${prefix}_versioned_docs/version-$root" ]]; then
    check_file_or_id "$DOCS_ROOT/${prefix}_versioned_docs/version-$root" "$rest"
  else
    check_file_or_id "$DOCS_ROOT/$source" "$rest"
  fi
}

function resolves_locally {
  local url_path="$1"

  # Strip fragment / trailing slash
  url_path="${url_path%%#*}"
  url_path="${url_path%/}"
  [[ -z "$url_path" ]] && url_path="/"

  if [[ "$url_path" == "/" ]]; then
    [[ -f "$DOCS_ROOT/docs/index.mdx" || -f "$DOCS_ROOT/docs/index.md" ]] && return 0
    return 1
  fi

  local clean="${url_path#/}"

  if [[ "$clean" =~ ^(developers|operate)(/(.*))?$ ]]; then
    resolves_in_instance "${BASH_REMATCH[1]}" "${BASH_REMATCH[3]}"
    return
  fi
  if [[ "$clean" == "participate" ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" "" && return 0
    return 1
  fi
  if [[ "$clean" =~ ^participate/(.*) ]]; then
    check_file_or_id "$DOCS_ROOT/docs-participate" "${BASH_REMATCH[1]}" && return 0
    return 1
  fi

  # Root-level pages (e.g. /aztec_connect_sunset)
  check_file_or_id "$DOCS_ROOT/docs" "$clean"
}

# Netlify serves /x from static/x, static/x.html or static/x/index.html.
function resolves_static {
  local p="${1#/}"
  p="${p%/}"
  [[ -n "$p" ]] || return 1
  [[ -f "$DOCS_ROOT/static/$p" || -f "$DOCS_ROOT/static/$p.html" || -f "$DOCS_ROOT/static/$p/index.html" ]]
}

# A cut version no network reads: built as HTML only, without markdown twins (llmsRoutes).
function is_historical_version_path {
  [[ "${1#/}" =~ ^(developers|operate)/([^/]+) ]] || return 1
  local base="${BASH_REMATCH[1]}" segment="${BASH_REMATCH[2]}" b p v
  while read -r b p v; do
    [[ "$b" == "$base" && "$p" == "$v" && "$p" == "$segment" ]] && return 0
  done <<<"$SERVED"
  return 1
}

function resolves_generated {
  local p="$1"
  case "$p" in
    /sitemap.xml | /llms.txt | /llms-full.txt | /index.md) return 0 ;;
  esac
  resolves_api_index "$p" && return 0
  # The markdown twin of a docs page: <route>.md.
  [[ "$p" == *.md && "$p" != /.md ]] || return 1
  is_historical_version_path "$p" && return 1
  resolves_locally "${p%.md}"
}

# Resolves "." and ".." segments as a browser does before requesting the path.
function normalize_url_path {
  local rest="${1#/}" seg out=""
  while [[ -n "$rest" ]]; do
    seg="${rest%%/*}"
    if [[ "$rest" == */* ]]; then rest="${rest#*/}"; else rest=""; fi
    case "$seg" in
      "" | .) ;;
      ..) out="${out%/*}" ;;
      *) out="$out/$seg" ;;
    esac
  done
  [[ "$1" == */ && -n "$out" ]] && out="$out/"
  echo "${out:-/}"
}

# The resolvers test files under DOCS_ROOT, so they only ever see a normalized path: a dot
# segment would otherwise reach files outside the docs version the URL names.
function resolves_url_path {
  local p
  p=$(normalize_url_path "$1")
  resolves_locally "$p" || resolves_static "$p" || resolves_generated "$p" || matches_any_redirect "$p"
}
