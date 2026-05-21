export async function streamAnswer({
  apiHost,
  apiKey,
  question,
  history,
  conversationId,
  onToken,
  onSource,
  onConversationId,
  onError,
  onDone,
  signal,
}) {
  const res = await fetch(`${apiHost.replace(/\/$/, "")}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      api_key: apiKey,
      history,
      conversation_id: conversationId || null,
      prompt_id: "default",
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`DocsGPT stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const payload = trimmed.startsWith("data:")
        ? trimmed.slice(5).trim()
        : trimmed;
      if (!payload || payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.type === "answer" && typeof parsed.answer === "string") {
        onToken(parsed.answer);
      } else if (parsed.type === "source" && parsed.source) {
        const sources = Array.isArray(parsed.source)
          ? parsed.source
          : [parsed.source];
        onSource(sources);
      } else if (parsed.type === "id" && parsed.id) {
        onConversationId(parsed.id);
      } else if (parsed.type === "error") {
        const message =
          typeof parsed.error === "string" && parsed.error.trim()
            ? parsed.error
            : "Something went wrong generating an answer.";
        onError?.(message);
        onDone();
        return;
      } else if (parsed.type === "end") {
        onDone();
        return;
      }
    }
  }
  onDone();
}
