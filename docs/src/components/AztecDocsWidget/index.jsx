import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";
import { DEFAULT_SUGGESTED, getTheme } from "./theme";
import { makeMarkdownComponents } from "./markdown";
import { streamAnswer } from "./streamAnswer";
import { sendFeedback } from "./sendFeedback";
import LauncherButton from "./LauncherButton";
import Panel from "./Panel";
import {
  buildShareUrl,
  clearShareHash,
  copyToClipboard,
  decodeShare,
  encodeShare,
  readShareHash,
} from "./share";

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
  const [shareState, setShareState] = useState("idle");
  // True while the panel is showing a conversation loaded from a
  // `#share=...` URL. Cleared on reset or when the recipient starts
  // their own follow-up so their messages don't blend into the shared
  // transcript.
  const [viewingShared, setViewingShared] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  // Flipped as soon as the user opens the panel, sends, or resets, so a
  // slow share-decode resolving later can't clobber an in-progress local
  // conversation.
  const userInteractedRef = useRef(false);

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

  // On first mount, replay a shared conversation if the URL hash carries
  // one. Decoding is async (uses DecompressionStream), so we set state
  // when it resolves; a malformed/oversize hash silently drops back to
  // the launcher state.
  useEffect(() => {
    const token = readShareHash();
    if (!token) return;
    let cancelled = false;
    decodeShare(token).then((shared) => {
      if (cancelled || userInteractedRef.current) return;
      if (!shared || shared.length === 0) return;
      // The codec models messages as a flat sequence of {role, text}.
      // The widget models them as Q&A pairs ({prompt, response}). Pair
      // up user→bot adjacencies; orphan user messages still render as
      // an unanswered prompt.
      const replayed = [];
      let pending = null;
      for (const m of shared) {
        if (m.role === "user") {
          if (pending) replayed.push(pending);
          pending = { prompt: m.text, response: "", sources: [] };
        } else {
          replayed.push({
            prompt: pending?.prompt ?? "",
            response: m.text,
            sources: m.sources ?? [],
          });
          pending = null;
        }
      }
      if (pending) replayed.push(pending);
      if (replayed.length === 0) return;
      setMessages(replayed);
      setViewingShared(true);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend(text) {
    const question = (text ?? input).trim();
    if (!question || streaming) return;
    userInteractedRef.current = true;
    setInput("");
    // Once the recipient continues the conversation it's no longer the
    // shared replay; drop the banner and scrub the hash so a refresh
    // doesn't reload the old transcript over the new one.
    if (viewingShared) {
      setViewingShared(false);
      clearShareHash();
    }
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
    userInteractedRef.current = true;
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setStreamText("");
    setStreamSources([]);
    setConversationId(null);
    setFeedbackByIndex({});
    setFeedbackErrorsByIndex({});
    if (viewingShared) {
      setViewingShared(false);
      clearShareHash();
    }
  }

  // Build a shareable URL with the current conversation encoded into the
  // hash and copy it to the clipboard. The encoded blob never leaves the
  // browser; the recipient's browser decompresses it locally.
  const handleShare = useCallback(async () => {
    const shareable = [];
    for (const m of messages) {
      if (m.prompt) shareable.push({ role: "user", text: m.prompt });
      if (m.response) {
        shareable.push({
          role: "bot",
          text: m.response,
          sources: m.sources,
        });
      }
    }
    if (shareable.length === 0) return;
    try {
      const token = await encodeShare(shareable);
      const url = buildShareUrl(token);
      const ok = await copyToClipboard(url);
      if (ok) {
        setShareState("ok");
      } else if (typeof window !== "undefined") {
        // window.prompt returns null only when the user cancels — treat
        // that as a failed copy rather than reporting "Link copied".
        const result = window.prompt("Copy this share link:", url);
        setShareState(result === null ? "fail" : "ok");
      } else {
        setShareState("fail");
      }
    } catch {
      setShareState("fail");
    }
    window.setTimeout(() => setShareState("idle"), 2200);
  }, [messages]);

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
          onOpen={() => {
            userInteractedRef.current = true;
            setOpen(true);
          }}
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
          onShare={handleShare}
          shareState={shareState}
          viewingShared={viewingShared}
        />
      )}
    </div>
  );
}
