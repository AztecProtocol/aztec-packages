#!/bin/sh
cat >dest/node-cjs/package.json <<!EOF
{
    "type": "commonjs"
}
!EOF

# `import.meta` is a syntax error in CommonJS, so tsc cannot emit the one expression that uses it
# (getCurrentDir's ESM branch, which CJS never reaches because __dirname is defined there). Blank
# it out. Anything that needs the value at runtime — `new URL('./x', import.meta.url)` and the
# like — must not be written in code that this build compiles: it would silently become
# `new URL('./x', "")` and throw. See dest/node for the ESM build, where it is left alone.
find ./dest/node-cjs -name "*.js" -exec sed -i.bak 's/import\.meta\.url/""/g' {} \; -exec rm -f {}.bak \;
