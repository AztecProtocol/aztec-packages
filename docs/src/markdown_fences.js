// A fence closes only on a run of its own character at least as long with nothing after it, and a
// backtick fence's info string holds no backtick ("```ts x```" is inline code, not an opener), as
// in CommonMark. Fences nested in list items are indented, so any indentation is accepted.
const DELIMITER = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/**
 * Which lines of a markdown text are fenced code.
 *
 * @param {string[]} lines
 * @returns {boolean[]} true for each line inside a fence, its delimiters included
 */
function fencedLines(lines) {
  let open = "";
  return lines.map((line) => {
    const [, run = "", rest = ""] = DELIMITER.exec(line) ?? [];
    if (open) {
      if (run[0] === open[0] && run.length >= open.length && !rest.trim()) open = "";
      return true;
    }
    if (run && !(run[0] === "`" && rest.includes("`"))) {
      open = run;
      return true;
    }
    return false;
  });
}

module.exports = { fencedLines };
