// Reliable grep replacement (bash stdout is being intercepted for file reads
// in this env). Usage: node nsearch.mjs <regex> <file-or-glob...>
import fs from 'fs';
import path from 'path';
const [, , pattern, ...files] = process.argv;
const re = new RegExp(pattern);
function* walk(p) {
  if (fs.statSync(p).isDirectory()) {
    for (const e of fs.readdirSync(p)) yield* walk(path.join(p, e));
  } else yield p;
}
const out = [];
for (const arg of files) {
  let targets = [];
  try { targets = [...walk(arg)]; } catch { targets = [arg]; }
  for (const f of targets) {
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = s.split('\n');
    lines.forEach((ln, i) => { if (re.test(ln)) out.push(`${f}:${i + 1}: ${ln}`); });
  }
}
process.stdout.write(out.join('\n') + '\n' + `[[${out.length} matches]]` + '\n');
