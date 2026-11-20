#!/usr/bin/env sh
# Regenerate the SVGs from their .tex sources.
#
# Uses node-tikzjax (a WASM port of TikZJax) so no system LaTeX install is
# needed — only Node.js. On first run npm fetches node-tikzjax into a
# .build/ cache; subsequent runs are warm.
#
# To use a *real* LaTeX install instead (faster, fewer surprises with
# advanced TikZ macros), set BUILDER=pdflatex and have `pdflatex` +
# `pdf2svg` on PATH. The script will then run pdflatex → pdf2svg.

set -eu

cd "$(dirname "$0")"

BUILDER="${BUILDER:-tikzjax}"

case "$BUILDER" in
  tikzjax)
    command -v node >/dev/null 2>&1 || { echo "build.sh: node not found. Install Node.js >=18, or set BUILDER=pdflatex." >&2; exit 1; }
    mkdir -p .build
    if [ ! -d .build/node_modules/node-tikzjax ]; then
      echo "» installing node-tikzjax into .build/ (first run only)"
      printf '{"name":"diagram-render","private":true,"version":"0.0.0"}\n' > .build/package.json
      (cd .build && npm install --no-audit --no-fund node-tikzjax >/dev/null 2>&1)
    fi
    for tex in *.tex; do
      svg="${tex%.tex}.svg"
      echo "» $tex → $svg"
      node render-tikzjax.mjs "$tex" "$svg"
    done
    ;;

  pdflatex)
    command -v pdflatex >/dev/null 2>&1 || { echo "build.sh: pdflatex not found." >&2; exit 1; }
    command -v pdf2svg  >/dev/null 2>&1 || { echo "build.sh: pdf2svg not found."  >&2; exit 1; }
    mkdir -p .build
    for tex in *.tex; do
      stem="${tex%.tex}"
      echo "» $tex → $stem.svg (via pdflatex + pdf2svg)"
      pdflatex -interaction=nonstopmode -output-directory=.build "$tex" >/dev/null
      pdf2svg ".build/$stem.pdf" "$stem.svg"
    done
    ;;

  *)
    echo "build.sh: unknown BUILDER=$BUILDER (expected: tikzjax | pdflatex)" >&2
    exit 1
    ;;
esac

echo "» done"
