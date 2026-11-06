// Serves `…/migration_notes.md?from=X&to=Y` from the section index the build writes beside each
// twin (scripts/index_migration_notes.mjs); with neither parameter, or with no index, the static
// twin (the full notes, with no "Included versions" header) is served instead.
import { queryProblem, renderRange, selectRange } from "../../src/migration_ranges.mjs";

const USAGE =
  "Use ?from=<your version>&to=<target version>, for example ?from=5.2.0&to=6.0.0. Versions are semver, " +
  "with or without a leading v. to defaults to the newest release on the page; to=unreleased adds the notes not yet released.";

function reply(status, body, type) {
  return new Response(body, {
    status,
    headers: { "content-type": `${type}; charset=utf-8`, "x-content-type-options": "nosniff" },
  });
}

const badRange = (problem, sections) =>
  reply(
    400,
    [`Bad range: ${problem}.`, USAGE, ...(sections ? [`Versions on this page, newest first: ${sections.map((s) => s.version).join(", ")}`] : [])].join("\n") + "\n",
    "text/plain",
  );

export default async (request) => {
  const url = new URL(request.url);
  const query = { from: url.searchParams.get("from"), to: url.searchParams.get("to") };
  if (query.from === null && query.to === null) return;
  const problem = queryProblem(query);
  if (problem) return badRange(problem);

  // Assigned, never resolved as a reference: a path that starts with `//` would name another host.
  const indexUrl = new URL(url.origin);
  indexUrl.pathname = url.pathname.replace(/\.md$/, ".json");
  const index = await fetch(indexUrl);
  if (!index.ok) return;
  const { sections } = await index.json();
  let selection;
  try {
    selection = selectRange(sections, query);
  } catch (error) {
    if (error instanceof RangeError) return badRange(error.message, sections);
    throw error;
  }
  return reply(200, renderRange(selection, url.origin + url.pathname.replace(/\.md$/, "")), "text/markdown");
};

export const config = { path: "/*/migration_notes.md" };
