export async function sendFeedback({
  apiHost,
  apiKey,
  conversationId,
  questionIndex,
  feedback,
  signal,
}) {
  if (!conversationId || questionIndex == null) {
    throw new Error("Feedback requires conversationId and questionIndex");
  }
  const res = await fetch(`${apiHost.replace(/\/$/, "")}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      question_index: questionIndex,
      feedback,
      api_key: apiKey,
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`DocsGPT feedback failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
}
