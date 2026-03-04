/**
 * Auto-tagging module — uses Claude Haiku to generate tags for workspaces.
 * Tags are cached in worktree meta.json so Haiku is only called once per workspace.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function generateTags(prompt: string, activitySummary: string): Promise<string[]> {
  if (!ANTHROPIC_API_KEY) return ["untagged"];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: "Generate 2-5 short lowercase tags for this coding session. Tags should categorize the work area (e.g. crypto, ci, docs, tests) and task type (e.g. bug, feature, refactor, cleanup). Return ONLY a JSON array of strings, nothing else.",
        messages: [{
          role: "user",
          content: `Task: ${prompt}\n\nRecent activity:\n${activitySummary}`,
        }],
      }),
    });

    if (!res.ok) {
      console.warn(`[TAGGER] Haiku API returned ${res.status}`);
      return ["untagged"];
    }

    const data = await res.json() as any;
    const text = data.content?.[0]?.text || "[]";
    const tags = JSON.parse(text);
    if (!Array.isArray(tags) || tags.length === 0) return ["untagged"];
    return tags
      .filter((t: any): t is string => typeof t === "string")
      .map((t: string) => t.toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter((t: string) => t.length > 0)
      .slice(0, 5);
  } catch (e) {
    console.warn(`[TAGGER] Failed to generate tags: ${e}`);
    return ["untagged"];
  }
}
