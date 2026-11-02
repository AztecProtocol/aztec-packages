# shellcheck shell=bash
# docs_routes - Resolves docs.aztec.network URL paths offline, the way production serves them, from
# the source tree and netlify.toml alone (no build, no install, no network). Source it, then call
# docs_routes_init; DOCS_ROOT defaults to the docs/ directory above this file.
#
#   resolves_locally <path>      a page of the docs version production serves at that path
#   resolves_static <path>       a file under static/, with Netlify pretty URLs
#   resolves_generated <path>    a file every build writes: sitemap, llms files, markdown twins
#   matches_any_redirect <path>  a netlify.toml [[redirects]] `from` pattern
#   resolves_url_path <path>     any of the above

DOCS_ROOT="${DOCS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
NETLIFY_TOML="$DOCS_ROOT/netlify.toml"

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

  # The API reference folders production builds a scoped llms.txt for: one per developer docs
  # version a network reads (append_api_docs_to_llms.js).
  API_FOLDERS=$(cd "$DOCS_ROOT" && node -e '
const { aztecNrApiFolders, docsInstances } = require("./src/network_docs");
const [developer] = docsInstances(require("./developer_version_config.json"), require("./network_version_config.json"), true);
for (const folder of new Set(Object.values(aztecNrApiFolders(developer)))) console.log(folder);
') || { echo "ERROR: could not read the API reference folders" >&2; return 1; }

  REDIRECT_FROMS=()
  while IFS= read -r line; do REDIRECT_FROMS+=("$line"); done < <(grep -E '^[[:space:]]*from[[:space:]]*=' "$NETLIFY_TOML" \
    | sed -E 's/^[[:space:]]*from[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/')

  REDIRECT_REGEXES=()
  local from
  for from in "${REDIRECT_FROMS[@]}"; do
    REDIRECT_REGEXES+=("$(from_to_regex "$from")")
  done
}

# Convert a netlify `from` pattern into an extended-regex.
# Netlify supports two path placeholders:
#   *        — splat, matches any remaining path (including slashes)
#   :name    — named segment, matches one path segment (no slashes)
function from_to_regex {
  local pattern="$1"
  # Replace :name placeholders with a sentinel that won't collide with regex metachars. The
  # sentinel byte comes from bash: BSD sed has no \x escapes in a replacement.
  pattern=$(echo "$pattern" | sed -E "s@:[A-Za-z_][A-Za-z0-9_]*@"$'\x01'"@g")
  # Escape regex metachars except * and our sentinel
  pattern=$(echo "$pattern" | sed -E 's/[][\\.^$+?{}()|]/\\&/g')
  pattern="${pattern//\*/.*}"
  pattern="${pattern//$'\x01'/[^/]+}"
  # Anchor; permit absent leading slash since some entries omit it
  if [[ "$pattern" != /* && "$pattern" != \\.* ]]; then
    pattern="/?$pattern"
  fi
  echo "^${pattern}$"
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

# A docs file is served at its file name unless its front matter names another id or a slug.
function served_at_file_name {
  local file="$1" stem key value
  stem=${file##*/}
  stem=${stem%.*}
  while read -r key value; do
    [[ "$key" == slug: || "$value" != "$stem" ]] && return 1
  done < <(sed -nE '/^---$/,/^---$/{s/^(id|slug):[[:space:]]*/\1: /p;}' "$file")
  return 0
}

# Whether a Docusaurus docs directory serves <sub_path>: a file at its name, a directory index,
# a number-prefixed file or an `id`. Partials (`_` names) and `index` itself are never routes.
function check_file_or_id {
  local base_dir="$1"
  local sub_path="$2"

  if [[ -z "$sub_path" ]]; then
    [[ -f "$base_dir/index.md" || -f "$base_dir/index.mdx" ]] && return 0
    return 1
  fi
  [[ "/$sub_path" == */_* || "/$sub_path" == */index ]] && return 1

  for ext in md mdx; do
    [[ -f "$base_dir/${sub_path}.${ext}" ]] && served_at_file_name "$base_dir/${sub_path}.${ext}" && return 0
  done

  if [[ -d "$base_dir/${sub_path}" ]]; then
    for ext in md mdx; do
      [[ -f "$base_dir/${sub_path}/index.${ext}" ]] && return 0
    done
  fi

  # Docusaurus number-prefix and id frontmatter fallbacks
  local parent_dir slug search_dir
  if [[ "$sub_path" == */* ]]; then
    parent_dir="${sub_path%/*}"
    slug="${sub_path##*/}"
    search_dir="$base_dir/$parent_dir"
  else
    parent_dir=""
    slug="$sub_path"
    search_dir="$base_dir"
  fi

  if [[ -d "$search_dir" ]]; then
    local file file_id name
    for file in "$search_dir"/*.md "$search_dir"/*.mdx; do
      [[ -f "$file" ]] || continue
      # Docusaurus drops a number prefix from the route: 01-the-contract.md serves the-contract.
      name=${file##*/}
      [[ "$name" == _* ]] && continue
      if [[ "${name%.*}" =~ ^[0-9]+[-_.](.+)$ ]] && [[ "${BASH_REMATCH[1]}" == "$slug" ]]; then
        return 0
      fi
      file_id=$(sed -n '/^---$/,/^---$/{s/^id:[[:space:]]*//p;}' "$file" | head -1)
      [[ "$file_id" == "$slug" ]] && return 0
    done
  fi

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
  local p="$1" folder
  case "$p" in
    /sitemap.xml | /llms.txt | /llms-full.txt | /index.md) return 0 ;;
  esac
  if [[ "$p" =~ ^/(aztec-nr-api|typescript-api)/([^/]+)/llms\.txt$ ]]; then
    folder="${BASH_REMATCH[2]}"
    [[ -d "$DOCS_ROOT/static/${BASH_REMATCH[1]}/$folder" ]] || return 1
    grep -qxF "$folder" <<<"$API_FOLDERS"
    return
  fi
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
