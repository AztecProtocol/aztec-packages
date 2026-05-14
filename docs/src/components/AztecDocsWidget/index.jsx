import React, { useEffect, useRef, useState } from "react";
import "./styles.css";
import { DEFAULT_SUGGESTED, getTheme } from "./theme";
import { makeMarkdownComponents } from "./markdown";
import { streamAnswer } from "./streamAnswer";
import { sendFeedback } from "./sendFeedback";
import LauncherButton from "./LauncherButton";
import Panel from "./Panel";

export default function AztecDocsWidget({
  apiHost,
  apiKey,
  title = "Ask about Aztec",
  heroTitle = "Aztec Docs Assistant",
  heroDescription = "Ask me anything about building on the privacy network — Noir, rollups, nullifiers, testnet setup.",
  suggestedPrompts = DEFAULT_SUGGESTED,
  theme = "ink",
  accent = "chartreuse",
  buttonStyle = "symbol",
  size = "roomy",
  position = "br",
  motif = true,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamSources, setStreamSources] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [feedbackByIndex, setFeedbackByIndex] = useState({});
  const [feedbackErrorsByIndex, setFeedbackErrorsByIndex] = useState({});
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  const tokens = React.useMemo(() => getTheme(theme, accent), [theme, accent]);
  const mdComponents = React.useMemo(
    () => makeMarkdownComponents(tokens.isInk, tokens.accentColor),
    [tokens.isInk, tokens.accentColor],
  );

  // Only auto-scroll to the bottom when a new message is appended (user
  // sends a question). Don't follow streaming tokens — the user should
  // be free to scroll away while the response is generating.
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSend(text) {
    const question = (text ?? input).trim();
    if (!question || streaming) return;
    setInput("");
    const nextHistory = messages.map((m) => ({
      prompt: m.prompt,
      response: m.response,
    }));
    const nextMessages = [
      ...messages,
      { prompt: question, response: "", sources: [] },
    ];
    setMessages(nextMessages);
    setStreaming(true);
    setStreamText("");
    setStreamSources([]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = "";
    let sources = [];
    let errorMessage = null;
    try {
      await streamAnswer({
        apiHost,
        apiKey,
        question,
        history: nextHistory,
        conversationId,
        signal: controller.signal,
        onToken: (chunk) => {
          acc += chunk;
          setStreamText(acc);
        },
        onSource: (src) => {
          sources = sources.concat(src);
          setStreamSources(sources);
        },
        onConversationId: (id) => setConversationId(id),
        onError: (message) => {
          errorMessage = message;
        },
        onDone: () => {},
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        errorMessage =
          errorMessage ||
          "Something went wrong fetching an answer. Please try again.";
      }
    }

    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = {
        prompt: question,
        response: acc,
        sources,
        error: errorMessage,
      };
      return copy;
    });
    setStreaming(false);
    setStreamText("");
    setStreamSources([]);
  }

  function handleReset() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setStreamText("");
    setStreamSources([]);
    setConversationId(null);
    setFeedbackByIndex({});
    setFeedbackErrorsByIndex({});
  }

  async function handleFeedback(messageIndex, kind) {
    if (!conversationId) return;
    if (feedbackByIndex[messageIndex]) return;
    setFeedbackByIndex((prev) => ({ ...prev, [messageIndex]: kind }));
    setFeedbackErrorsByIndex((prev) => {
      if (!prev[messageIndex]) return prev;
      const copy = { ...prev };
      delete copy[messageIndex];
      return copy;
    });
    try {
      await sendFeedback({
        apiHost,
        apiKey,
        conversationId,
        questionIndex: messageIndex,
        feedback: kind,
      });
    } catch (err) {
      setFeedbackByIndex((prev) => {
        const copy = { ...prev };
        delete copy[messageIndex];
        return copy;
      });
      setFeedbackErrorsByIndex((prev) => ({ ...prev, [messageIndex]: true }));
    }
  }

  return (
    <div className="azw">
      {!open && (
        <LauncherButton
          buttonStyle={buttonStyle}
          position={position}
          onOpen={() => setOpen(true)}
        />
      )}
      {open && (
        <Panel
          title={title}
          heroTitle={heroTitle}
          heroDescription={heroDescription}
          suggestedPrompts={suggestedPrompts}
          motif={motif}
          position={position}
          size={size}
          tokens={tokens}
          mdComponents={mdComponents}
          messages={messages}
          streaming={streaming}
          streamText={streamText}
          streamSources={streamSources}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onSuggest={handleSend}
          onReset={handleReset}
          onClose={() => setOpen(false)}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((v) => !v)}
          scrollRef={scrollRef}
          conversationId={conversationId}
          feedbackByIndex={feedbackByIndex}
          feedbackErrorsByIndex={feedbackErrorsByIndex}
          onFeedback={handleFeedback}
        />
      )}
    </div>
  );
}
