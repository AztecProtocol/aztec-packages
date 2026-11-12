// A fence closes only on a run of its own character at least as long with nothing after it, and a
// backtick fence's info string holds no backtick ("```ts x```" is inline code, not an opener), as
// in CommonMark. Fences nested in list items are indented, so any indentation is accepted.
const DELIMITER = /^[ \t]*(`{3,}|~{3,})(.*)$/;

// "open" and "close" for a fence's delimiters, "code" between them, "text" elsewhere.
function roles(lines) {
  let open = "";
  return lines.map((line) => {
    const [, run = "", rest = ""] = DELIMITER.exec(line) ?? [];
    if (open) {
      if (run[0] === open[0] && run.length >= open.length && !rest.trim()) {
        open = "";
        return "close";
      }
      return "code";
    }
    if (run && !(run[0] === "`" && rest.includes("`"))) {
      open = run;
      return "open";
    }
    return "text";
  });
}

/**
 * Which lines of a markdown text are fenced code.
 *
 * @param {string[]} lines
 * @returns {boolean[]} true for each line inside a fence, its delimiters included
 */
function fencedLines(lines) {
  return roles(lines).map((role) => role !== "text");
}

/**
 * The fenced code blocks of a markdown text, in order.
 *
 * @param {string[]} lines
 * @returns {{ line: number, info: string, body: string[] }[]} `line` is the opener's 1-based number; each
 *   body line loses up to the opener's indentation, as in CommonMark; an unclosed fence runs to the end
 */
function fenceBlocks(lines) {
  const blocks = [];
  roles(lines).forEach((role, i) => {
    if (role === "open") {
      const [, indent, info] = lines[i].match(/^([ \t]*)[`~]+(.*)$/);
      blocks.push({ line: i + 1, info: info.trim(), indent: new RegExp(`^[ \\t]{0,${indent.length}}`), body: [] });
    } else if (role === "code") {
      const block = blocks.at(-1);
      block.body.push(lines[i].replace(block.indent, ""));
    }
  });
  return blocks.map(({ indent, ...block }) => block);
}

module.exports = { fencedLines, fenceBlocks };
