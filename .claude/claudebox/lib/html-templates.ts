import type { SessionMeta } from "./types.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Sanitize a URL for use in href — only allow http/https schemes. */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function statusColor(s: string): string {
  if (s === "running") return "#61D668";
  if (s === "interactive") return "#FAD979";
  if (s === "completed") return "#61D668";
  if (s === "error") return "#E94560";
  if (s === "cancelled") return "#888";
  if (s === "interrupted") return "#FAD979";
  return "#888";
}

// ── Shared styles ──────────────────────────────────────────────

const BASE_STYLES = `
body{background:#000;color:#ccc;font-family:monospace;padding:10px;font-size:14px;line-height:1.5}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
.output{white-space:pre-wrap;word-wrap:break-word}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:#000}
::-webkit-scrollbar-thumb{background:#444;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#555}
`;

// ── Workspace Page ─────────────────────────────────────────────

export interface ActivityEntry {
  ts: string;
  type: string;  // "status", "response", "artifact", "tool_use", "agent_start", "context", "clone"
  text: string;
}

export interface WorkspacePageData {
  hash: string;            // current session log_id
  session: SessionMeta;    // current session
  sessions: SessionMeta[]; // all sessions for this worktree (newest first)
  worktreeAlive: boolean;
  activity: ActivityEntry[];  // newest first
}

function linkify(text: string): string {
  return text.replace(/(https?:\/\/[^\s&<"']+)/g, (m) => {
    // Strip trailing punctuation, but preserve balanced parentheses within URLs
    let url = m.replace(/[.,;:!?)}\]]+$/, '');
    // If we stripped closing parens that have matching openers in the URL, restore them
    const stripped = m.slice(url.length);
    for (const ch of stripped) {
      if (ch === ')' && (url.split('(').length > url.split(')').length)) {
        url += ch;
      } else break;
    }
    return `<a href="${url}" target="_blank" class="link">${url}</a>${m.slice(url.length)}`;
  });
}

function renderUserMsg(promptText: string, t: string, user: string): string {
  return `<div class="chat-msg user"><div class="chat-bubble user-bubble"><div class="chat-text">${promptText}</div><div class="chat-time">${t}</div></div><div class="chat-avatar user-avatar">${esc(user.slice(0, 2).toUpperCase())}</div></div>`;
}

function renderActivityEntry(a: ActivityEntry, agentLogUrl?: string): string {
  const text = esc(a.text);
  const linked = linkify(text);
  const timeStr = a.ts ? timeAgo(a.ts) : "";
  const msgHash = Buffer.from(a.text.slice(0, 50)).toString("base64url").slice(0, 12);
  if (a.type === "response") {
    return `<div class="chat-msg bot" data-msg="${msgHash}"><div class="chat-avatar reply-avatar">RE</div><div class="chat-bubble reply-bubble"><div class="chat-label reply-label">reply</div><div class="chat-text">${linked}</div><div class="chat-time">${timeStr}</div></div></div>`;
  } else if (a.type === "context") {
    return `<div class="chat-msg bot" data-msg="${msgHash}"><div class="chat-avatar">CB</div><div class="chat-bubble context-bubble"><div class="chat-text">${linked}</div><div class="chat-time">${timeStr}</div></div></div>`;
  } else if (a.type === "artifact") {
    return `<div class="chat-msg bot" data-msg="${msgHash}"><div class="chat-avatar">CB</div><div class="chat-bubble artifact-bubble"><div class="chat-label artifact-label">artifact</div><div class="chat-text">${linked}</div><div class="chat-time">${timeStr}</div></div></div>`;
  } else if (a.type === "agent_start") {
    const agentText = agentLogUrl
      ? `<a href="${agentLogUrl}" target="_blank" class="link">Agent: ${linked}</a>`
      : `Agent: ${linked}`;
    return `<div class="chat-agent" data-msg="${msgHash}"><div class="agent-dot"></div><span>${agentText}</span><span class="dim" style="margin-left:auto;font-size:10px">${timeStr}</span></div>`;
  } else if (a.type === "tool_use") {
    return `<div class="chat-status" data-msg="${msgHash}"><span class="tool-icon">\u25B8</span><code>${linked}</code><span class="ts">${timeStr}</span></div>`;
  } else if (a.type === "status") {
    return `<div class="chat-status" data-msg="${msgHash}"><span class="tool-icon">\u25CB</span><span>${linked}</span><span class="ts">${timeStr}</span></div>`;
  }
  return `<div class="chat-status" data-msg="${msgHash}"><span class="tool-icon">\u00B7</span><span>${linked}</span><span class="ts">${timeStr}</span></div>`;
}

export function workspacePageHTML(data: WorkspacePageData): string {
  const { hash, session, sessions, worktreeAlive, activity } = data;
  const worktreeId = session.worktree_id || "";
  const status = session.status || "unknown";
  const user = session.user || "unknown";
  const logUrl = session.log_url || "";
  const baseBranch = session.base_branch || "next";
  const isRunning = status === "running" || status === "interactive";
  const shortId = worktreeId ? worktreeId.slice(0, 8) : hash.slice(0, 8);

  // Sidebar: workspace stats + artifacts
  const artifacts = activity.filter(a => a.type === "artifact");
  const sidebarStats = `
    <div class="sidebar-section">
      <div class="sidebar-label">Workspace</div>
      <div class="stat-row"><span class="dim">status</span> <span id="sidebar-status" class="status-${status}">${status}${session.exit_code != null ? ` (${session.exit_code})` : ""}</span></div>
      <div class="stat-row"><span class="dim">user</span> ${esc(user)}</div>
      <div class="stat-row"><span class="dim">branch</span> ${esc(baseBranch)}</div>
      <div class="stat-row"><span class="dim">runs</span> ${sessions.length}</div>
      <div class="stat-row"><span class="dim">started</span> ${session.started ? timeAgo(session.started) : "\u2014"}</div>
      ${logUrl ? `<div class="stat-row"><span class="dim">log</span> <a href="${safeHref(logUrl)}" target="_blank" class="link">view</a></div>` : ""}
    </div>
    ${artifacts.length ? `<div class="sidebar-section"><div class="sidebar-label">Artifacts (${artifacts.length})</div>${artifacts.map(a => {
      const text = esc(a.text.length > 120 ? a.text.slice(0, 120) + "\u2026" : a.text);
      const linked = text.replace(/(https?:\/\/[^\s&<"']+)/g, (m) => { const u = m.replace(/[.,;:!?)}\]]+$/, ''); return `<a href="${u}" target="_blank" class="link">${u}</a>${m.slice(u.length)}`; });
      return `<div class="artifact-row">${linked}</div>`;
    }).join("\n")}</div>` : ""}`;

  // Build unified timeline: user prompts + session runs + activity entries
  type TimelineEntry = { ts: string; html: string };
  const timeline: TimelineEntry[] = [];

  const sessionsOldest = [...sessions].reverse();
  for (let i = 0; i < sessionsOldest.length; i++) {
    const s = sessionsOldest[i];
    const statusCls = s.status || "unknown";
    const exitStr = s.exit_code != null ? ` exit=${s.exit_code}` : "";
    const logLink = s.log_url ? ` <a href="${safeHref(s.log_url)}" target="_blank" class="link">log</a>` : "";
    const t = s.started ? timeAgo(s.started) : "";
    if (s.prompt) {
      const offsetTs = s.started ? new Date(new Date(s.started).getTime() - 1).toISOString() : "";
      timeline.push({ ts: offsetTs, html: renderUserMsg(esc(s.prompt), t, user) });
    }
    timeline.push({
      ts: s.started || "",
      html: `<div class="chat-run"><span class="run-line"></span><span class="run-label">Run ${i + 1}</span><span class="status-${statusCls}">${s.status || "?"}${exitStr}</span>${logLink}<span class="run-line"></span></div>`,
    });
  }

  // Build queue of agent log URLs (from stream-session.ts) to attach to agent_start entries
  const agentLogUrls: string[] = [];
  for (const a of activity) {
    if (a.type === "agent_log") {
      const urlMatch = a.text.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) agentLogUrls.push(urlMatch[1]);
    }
  }
  let agentLogIdx = 0;
  for (const a of activity) {
    if (a.type === "agent_log") continue; // rendered via agent_start
    const logUrl = a.type === "agent_start" ? agentLogUrls[agentLogIdx++] : undefined;
    timeline.push({ ts: a.ts || "", html: renderActivityEntry(a, logUrl) });
  }

  timeline.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
  const chatBubbles = timeline.map(e => e.html).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox \u2014 ${shortId}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#d4d4d4;font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
code,.mono{font-family:'SF Mono',Monaco,'Cascadia Code',monospace;font-size:12px}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
.link{color:#5FA7F1}
.dim{color:#666}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

/* Header */
.header{padding:8px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;flex-shrink:0;background:#0d0d0d}
.header-title{font-weight:600;color:#5FA7F1;font-size:14px;letter-spacing:-0.3px}
.header-id{color:#FAD979;font-size:12px;font-family:'SF Mono',monospace}
.header-status{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:500;letter-spacing:0.2px}

/* Status colors */
.status-running,.header-status.running{color:#61D668;background:rgba(97,214,104,0.1);border:1px solid rgba(97,214,104,0.2)}
.status-interactive,.header-status.interactive{color:#FAD979;background:rgba(250,217,121,0.1);border:1px solid rgba(250,217,121,0.2)}
.status-completed,.header-status.completed{color:#61D668;background:rgba(97,214,104,0.1);border:1px solid rgba(97,214,104,0.2)}
.status-error,.header-status.error{color:#E94560;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.2)}
.status-cancelled,.status-interrupted,.status-unknown,.header-status.cancelled,.header-status.interrupted,.header-status.unknown{color:#888;background:rgba(136,136,136,0.1);border:1px solid rgba(136,136,136,0.2)}

/* Layout */
.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:240px;border-right:1px solid #1a1a1a;display:flex;flex-direction:column;flex-shrink:0;background:#0d0d0d;overflow-y:auto;transition:margin-left 0.15s,opacity 0.15s}
.sidebar.collapsed{margin-left:-240px;opacity:0;pointer-events:none}
.sidebar-toggle{position:absolute;top:8px;left:8px;z-index:10;background:#151515;border:1px solid #333;color:#888;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all 0.15s}
.sidebar-toggle:hover{color:#ccc;border-color:#555}
.sidebar-section{padding:10px 12px;border-bottom:1px solid #1a1a1a}
.sidebar-label{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#555;margin-bottom:6px;font-weight:600}
.stat-row{font-size:12px;padding:2px 0;display:flex;gap:8px}
.stat-row .dim{min-width:50px;font-size:11px}
.artifact-row{font-size:11px;padding:4px 0;border-bottom:1px solid #111;word-break:break-all;line-height:1.4}

/* Chat */
.chat-area{flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:4px}
.chat-empty{flex:1;display:flex;align-items:center;justify-content:center;color:#333;font-size:13px}

/* Messages */
.chat-msg{display:flex;gap:8px;align-items:flex-start;animation:fadeIn 0.15s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.chat-msg.bot{flex-direction:row}
.chat-msg.user{flex-direction:row-reverse}
.chat-avatar{width:24px;height:24px;border-radius:6px;background:#1a1a2e;color:#5FA7F1;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;flex-shrink:0;margin-top:2px}
.user-avatar{background:#1a2e1a;color:#61D668}
.chat-bubble{max-width:75%;padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.55;word-break:break-word;white-space:pre-wrap}
.reply-bubble{background:#0d1a2e;border:1px solid #1a3060;color:#ddd}
.reply-avatar{background:#1a2e4a !important;color:#5FA7F1 !important}
.context-bubble{background:#0e0e0e;border:1px solid #1a1a1a;color:#999;font-size:12px}
.user-bubble{background:#0d1a0d;border:1px solid #1a331a;color:#ccc;text-align:left}
.artifact-bubble{background:#1a1a0a;border:1px solid #333020;color:#FAD979;font-size:12px}
.chat-time{font-size:10px;color:#444;margin-top:3px}
.chat-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
.chat-label.reply-label{color:#5FA7F1}
.chat-label.artifact-label{color:#FAD979}

/* Tool/status lines — compact */
.chat-status{display:flex;align-items:center;gap:6px;font-size:11px;color:#666;padding:2px 12px 2px 36px;font-family:'SF Mono',monospace}
.chat-status .ts{color:#444;font-size:10px;margin-left:auto;flex-shrink:0}
.tool-icon{font-size:10px;flex-shrink:0;width:14px;text-align:center}

/* Agent activity */
.chat-agent{display:flex;align-items:center;gap:6px;font-size:11px;color:#a78bfa;padding:3px 12px 3px 36px}
.agent-dot{width:6px;height:6px;border-radius:50%;background:#a78bfa;flex-shrink:0;animation:pulse 2s infinite}

/* Run dividers */
.chat-run{display:flex;align-items:center;gap:8px;padding:8px 0;margin:4px 0;color:#444;font-size:11px}
.run-line{flex:1;height:1px;background:#1a1a1a}
.run-label{font-weight:600;letter-spacing:0.5px;white-space:nowrap}

/* Typing indicator */
.typing{display:flex;align-items:center;gap:8px;padding:4px 12px 4px 36px}
.typing-dots{display:flex;gap:3px}
.typing-dots span{width:5px;height:5px;border-radius:50%;background:#5FA7F1;animation:typing 1.4s infinite}
.typing-dots span:nth-child(2){animation-delay:0.2s}
.typing-dots span:nth-child(3){animation-delay:0.4s}
@keyframes typing{0%,60%,100%{opacity:0.2;transform:scale(0.8)}30%{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.typing-label{font-size:11px;color:#555}

/* Queued messages */
.queued-msg{display:flex;gap:8px;align-items:flex-start;flex-direction:row-reverse;opacity:0.6}
.queued-bubble{max-width:75%;padding:8px 12px;border-radius:10px;background:#111;border:1px dashed #333;color:#888;font-size:13px;white-space:pre-wrap}
.queued-badge{font-size:9px;color:#FAD979;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px}
.queued-remove{font-size:10px;color:#666;cursor:pointer;margin-top:3px}
.queued-remove:hover{color:#E94560}

/* Reply bar */
.reply-bar{padding:8px 16px;border-top:1px solid #1a1a1a;display:flex;gap:8px;align-items:flex-end;flex-shrink:0;background:#0d0d0d}
.reply-bar textarea{flex:1;background:#111;border:1px solid #222;border-radius:10px;padding:10px 14px;color:#d4d4d4;font-family:'Inter',system-ui,sans-serif;font-size:13px;resize:none;height:44px;max-height:120px;line-height:1.5;transition:border-color 0.15s}
.reply-bar textarea:focus{outline:none;border-color:#5FA7F1;height:80px}
.reply-bar textarea::placeholder{color:#444}
.reply-actions{display:flex;gap:4px;align-items:flex-end}

/* Buttons */
.btn{background:#151515;color:#ccc;border:1px solid #333;border-radius:8px;padding:6px 14px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s}
.btn:hover{background:#222;color:#fff}
.btn:disabled{color:#444;border-color:#222;cursor:default;background:#0d0d0d}
.btn-send{background:#1a3d1a;border-color:#2d5a2d;color:#61D668}.btn-send:hover{background:#1f4a1f}
.btn-queue{background:#1a1a0a;border-color:#333020;color:#FAD979}.btn-queue:hover{background:#222200}
.btn-red{border-color:#E94560;color:#E94560}.btn-red:hover{background:#1f0d0d}
.btn-blue{border-color:#5FA7F1;color:#5FA7F1}.btn-blue:hover{background:#0d0d1f}

.main-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
.warning{background:rgba(233,69,96,0.08);border:1px solid rgba(233,69,96,0.2);color:#E94560;padding:8px 12px;margin:8px 12px;border-radius:6px;font-size:12px}

@media(max-width:768px){.sidebar{width:180px}.sidebar.collapsed{margin-left:-180px}.chat-bubble{max-width:90%}}
@media(max-width:480px){.sidebar{display:none}.sidebar-toggle{display:none}}
</style>
</head>
<body>

<div class="header">
  <span class="header-title"><a href="/dashboard" class="link">ClaudeBox</a></span>
  <span class="header-id">${shortId}</span>
  <span class="header-status ${status}" id="header-status">${status}${session.exit_code != null ? ` (${session.exit_code})` : ""}</span>
</div>

${!worktreeAlive && worktreeId ? `<div class="warning">Workspace has been deleted. Resume is unavailable.</div>` : ""}

<div class="layout" style="position:relative">
  <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">\u2630</button>
  <div class="sidebar collapsed" id="sidebar">${sidebarStats}</div>
  <div class="main-area">
    <div class="chat-area" id="chat-area">
      ${chatBubbles || `<div class="chat-empty">No activity yet</div>`}
      ${isRunning ? `<div class="typing" id="typing-indicator"><div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-label">working\u2026</span></div>` : ""}
    </div>
    <div id="queued-container"></div>
    ${worktreeAlive && worktreeId ? `<div class="reply-bar" id="reply-bar">
      <textarea id="resume-prompt" placeholder="${isRunning ? "Queue a message\u2026 (Ctrl+Enter)" : "Send a follow-up\u2026 (Ctrl+Enter)"}" ></textarea>
      <div class="reply-actions">
        ${isRunning
          ? `<button id="queue-btn" class="btn btn-queue" onclick="queueMessage()">Queue</button>`
          : `<button id="resume-btn" class="btn btn-send" onclick="resumeSession()">Send</button>`}
        ${isRunning ? `<button id="cancel-btn" class="btn btn-red" onclick="cancelSession()">Cancel</button>` : ""}
      </div>
    </div>` : ""}
  </div>
</div>

<!-- Auth overlay -->
<div id="auth-overlay" style="display:flex;position:fixed;inset:0;background:#0a0a0a;z-index:100;align-items:center;justify-content:center">
  <form id="auth-form" autocomplete="on" style="background:#111;border:1px solid #333;border-radius:12px;padding:24px;width:280px;display:flex;flex-direction:column;gap:12px">
    <div style="color:#5FA7F1;font-weight:600;font-size:14px;text-align:center">ClaudeBox Login</div>
    <input id="auth-user" name="username" type="text" autocomplete="username" placeholder="Username" style="background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#d4d4d4;font-family:inherit;font-size:13px" required>
    <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" style="background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#d4d4d4;font-family:inherit;font-size:13px" required>
    <div style="display:flex;gap:8px">
      <button type="submit" class="btn btn-blue" style="flex:1;padding:8px">Login</button>
    </div>
    <div id="auth-error" style="color:#E94560;font-size:11px;text-align:center;display:none"></div>
  </form>
</div>

<script>
(function(){
  var chatArea=document.getElementById("chat-area");
  // Reliable scroll-to-bottom after DOM settles
  if(chatArea){requestAnimationFrame(function(){chatArea.scrollTop=chatArea.scrollHeight;setTimeout(function(){chatArea.scrollTop=chatArea.scrollHeight;},200);});}

  // Sidebar toggle (collapsed by default, persisted in sessionStorage)
  var sidebar=document.getElementById("sidebar"),sidebarBtn=document.getElementById("sidebar-toggle");
  var sidebarOpen=sessionStorage.getItem("cb_sidebar")==="open";
  if(sidebarOpen&&sidebar)sidebar.classList.remove("collapsed");
  if(sidebarBtn)sidebarBtn.addEventListener("click",function(){
    sidebar.classList.toggle("collapsed");
    sessionStorage.setItem("cb_sidebar",sidebar.classList.contains("collapsed")?"closed":"open");
  });

  var ID="${worktreeId || hash}";
  var currentStatus="${status}";
  var seenMsgs=new Set();
  var messageQueue=JSON.parse(localStorage.getItem("cb_queue_"+ID)||"[]");

  // Track already-rendered entries so SSE doesn't duplicate
  document.querySelectorAll("[data-msg]").forEach(function(el){seenMsgs.add(el.dataset.msg);});

  function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
  function linkify(s){return s.replace(/(https?:\\/\\/[^\\s&<"']+)/g,function(m){var u=m.replace(/[.,;:!?)}\]]+$/,'');var rest=m.slice(u.length);for(var i=0;i<rest.length;i++){if(rest[i]===')'&&u.split('(').length>u.split(')').length){u+=rest[i]}else break}return'<a href="'+u+'" target="_blank" class="link">'+u+'</a>'+m.slice(u.length)})}
  function msgId(text){var h=0;for(var i=0;i<Math.min(text.length,50);i++){h=((h<<5)-h)+text.charCodeAt(i);h|=0;}return"m"+Math.abs(h).toString(36)}
  function timeAgo(iso){var ms=Date.now()-new Date(iso).getTime();if(ms<60000)return"just now";if(ms<3600000)return Math.floor(ms/60000)+"m ago";if(ms<86400000)return Math.floor(ms/3600000)+"h ago";return Math.floor(ms/86400000)+"d ago";}

  var agentLogUrls=[];
  function renderEntry(e){
    if(e.type==="agent_log"){
      var m=e.text.match(/(https?:\\/\\/[^\\s]+)/);
      if(m){
        // Try to retroactively link an already-rendered unlinked agent_start
        var agents=chatArea?chatArea.querySelectorAll(".chat-agent"):[];
        var linked=false;
        for(var i=0;i<agents.length;i++){
          var sp=agents[i].querySelector("span");
          if(sp&&sp.textContent.indexOf("Agent:")===0&&!sp.querySelector("a.link")){
            sp.innerHTML='<a href="'+m[1]+'" target="_blank" class="link">'+sp.innerHTML+'</a>';
            linked=true;break;
          }
        }
        if(!linked)agentLogUrls.push(m[1]);
      }
      return null;
    }
    var text=esc(e.text);var linked=linkify(text);var t=e.ts?timeAgo(e.ts):"";var id=msgId(e.text);
    if(seenMsgs.has(id))return null;seenMsgs.add(id);
    if(e.type==="response"){
      return '<div class="chat-msg bot" data-msg="'+id+'"><div class="chat-avatar reply-avatar">RE</div><div class="chat-bubble reply-bubble"><div class="chat-label reply-label">reply</div><div class="chat-text">'+linked+'</div><div class="chat-time">'+t+'</div></div></div>';
    }else if(e.type==="context"){
      return '<div class="chat-msg bot" data-msg="'+id+'"><div class="chat-avatar">CB</div><div class="chat-bubble context-bubble"><div class="chat-text">'+linked+'</div><div class="chat-time">'+t+'</div></div></div>';
    }else if(e.type==="artifact"){
      return '<div class="chat-msg bot" data-msg="'+id+'"><div class="chat-avatar">CB</div><div class="chat-bubble artifact-bubble"><div class="chat-label artifact-label">artifact</div><div class="chat-text">'+linked+'</div><div class="chat-time">'+t+'</div></div></div>';
    }else if(e.type==="agent_start"){
      var aUrl=agentLogUrls.shift();
      var agentText=aUrl?'<a href="'+aUrl+'" target="_blank" class="link">Agent: '+linked+'</a>':'Agent: '+linked;
      return '<div class="chat-agent" data-msg="'+id+'"><div class="agent-dot"></div><span>'+agentText+'</span><span class="dim" style="margin-left:auto;font-size:10px">'+t+'</span></div>';
    }else if(e.type==="tool_use"){
      return '<div class="chat-status" data-msg="'+id+'"><span class="tool-icon">\u25B8</span><code>'+linked+'</code><span class="ts">'+t+'</span></div>';
    }else if(e.type==="status"){
      return '<div class="chat-status" data-msg="'+id+'"><span class="tool-icon">\u25CB</span><span>'+linked+'</span><span class="ts">'+t+'</span></div>';
    }
    return '<div class="chat-status" data-msg="'+id+'"><span class="tool-icon">\u00B7</span><span>'+linked+'</span><span class="ts">'+t+'</span></div>';
  }

  function appendEntry(html){
    if(!html||!chatArea)return;
    var typing=document.getElementById("typing-indicator");
    if(typing)typing.remove();
    var div=document.createElement("div");div.innerHTML=html;
    while(div.firstChild)chatArea.appendChild(div.firstChild);
    if(currentStatus==="running"||currentStatus==="interactive"){
      var ti=document.createElement("div");ti.className="typing";ti.id="typing-indicator";
      ti.innerHTML='<div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-label">working\u2026</span>';
      chatArea.appendChild(ti);
    }
    chatArea.scrollTop=chatArea.scrollHeight;
  }

  function showUserMessage(text){
    var html='<div class="chat-msg user"><div class="chat-bubble user-bubble"><div class="chat-text">'+esc(text)+'</div><div class="chat-time">just now</div></div><div class="chat-avatar user-avatar">YOU</div></div>';
    appendEntry(html);
  }

  function updateStatus(st,exitCode){
    if(st===currentStatus)return;
    var wasRunning=currentStatus==="running"||currentStatus==="interactive";
    currentStatus=st;
    // Update header
    var hdr=document.getElementById("header-status");
    if(hdr){hdr.className="header-status "+st;hdr.textContent=st+(exitCode!=null?" ("+exitCode+")":"");}
    // Update sidebar
    var sb=document.getElementById("sidebar-status");
    if(sb){sb.className="status-"+st;sb.textContent=st+(exitCode!=null?" ("+exitCode+")":"");}
    // Remove typing indicator if no longer running
    if(wasRunning&&st!=="running"&&st!=="interactive"){
      var ti=document.getElementById("typing-indicator");if(ti)ti.remove();
      // Auto-send queued messages
      if(messageQueue.length>0)sendNextQueued();
      // Swap queue btn to send btn
      updateReplyBar(false);
    }
  }

  // ── SSE Stream ─────────────────────────────────────────────────
  var evtSource=null;
  function connectSSE(){
    if(evtSource)evtSource.close();
    var c=loadCreds();
    var sseUrl="/s/"+ID+"/events"+(c?"?token="+btoa(c.user+":"+c.pass):"");
    evtSource=new EventSource(sseUrl);
    evtSource.onmessage=function(ev){
      try{
        var d=JSON.parse(ev.data);
        if(d.type==="activity"&&d.entry){
          var html=renderEntry(d.entry);
          if(html)appendEntry(html);
        }else if(d.type==="status"){
          updateStatus(d.status,d.exit_code);
        }else if(d.type==="init"){
          // Render activity from SSE (not server-rendered for security)
          if(Array.isArray(d.activity)){
            for(var i=0;i<d.activity.length;i++){
              var h=renderEntry(d.activity[i]);
              if(h)appendEntry(h);
            }
          }
          updateStatus(d.status,d.exit_code);
        }
      }catch(e){}
    };
    evtSource.onerror=function(){
      // Reconnect after a delay
      evtSource.close();evtSource=null;
      setTimeout(connectSSE,5000);
    };
  }
  // connectSSE() is called after authentication in onAuthenticated()

  // ── Message Queue ─────────────────────────────────────────────
  function saveQueue(){localStorage.setItem("cb_queue_"+ID,JSON.stringify(messageQueue));}
  function renderQueue(){
    var container=document.getElementById("queued-container");if(!container)return;
    if(!messageQueue.length){container.innerHTML="";return;}
    var html='<div style="padding:4px 20px;border-top:1px solid #1a1a1a">';
    for(var i=0;i<messageQueue.length;i++){
      html+='<div class="queued-msg" style="margin:4px 0"><div class="chat-avatar user-avatar" style="opacity:0.5">\u2026</div><div class="queued-bubble">'+esc(messageQueue[i])+'<div class="queued-badge">queued</div><div class="queued-remove" onclick="removeQueued('+i+')">\u2715 remove</div></div></div>';
    }
    html+="</div>";container.innerHTML=html;
  }
  window.queueMessage=function(){
    var input=document.getElementById("resume-prompt");
    var text=input&&input.value.trim();if(!text)return;
    messageQueue.push(text);saveQueue();renderQueue();
    input.value="";input.style.height="44px";
  };
  window.removeQueued=function(i){
    messageQueue.splice(i,1);saveQueue();renderQueue();
  };
  function sendNextQueued(){
    if(!messageQueue.length)return;
    var msg=messageQueue.shift();saveQueue();renderQueue();
    showUserMessage(msg);
    requireAuth(function(){
      authFetch("/s/"+ID+"/resume",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:msg})}).then(function(r){return r.json();}).then(function(d){
        if(!d.ok)console.warn("Queue send failed:",d.message);
      }).catch(function(e){console.warn("Queue send error:",e);});
    });
  }
  renderQueue();

  function updateReplyBar(isRunning){
    var bar=document.getElementById("reply-bar");if(!bar)return;
    var input=document.getElementById("resume-prompt");
    var actions=bar.querySelector(".reply-actions");
    if(isRunning){
      if(input)input.placeholder="Queue a message\u2026 (Ctrl+Enter)";
      if(actions)actions.innerHTML='<button id="queue-btn" class="btn btn-queue" onclick="queueMessage()">Queue</button><button id="cancel-btn" class="btn btn-red" onclick="cancelSession()">Cancel</button>';
    }else{
      if(input)input.placeholder="Send a follow-up\u2026 (Ctrl+Enter)";
      if(actions)actions.innerHTML='<button id="resume-btn" class="btn btn-send" onclick="resumeSession()">Send</button>';
    }
  }

  // ── Auth (required on page load) ────────────────────────────────
  var _creds=null,_authCallback=null;
  function loadCreds(){if(_creds)return _creds;try{var s=sessionStorage.getItem("cb_auth");if(s){_creds=JSON.parse(s);return _creds;}}catch{}return null;}
  function saveCreds(u,p){_creds={user:u,pass:p,basic:"Basic "+btoa(u+":"+p)};try{sessionStorage.setItem("cb_auth",JSON.stringify(_creds));}catch{}return _creds;}
  function showAuth(cb){_authCallback=cb;var o=document.getElementById("auth-overlay");o.style.display="flex";document.getElementById("auth-error").style.display="none";document.getElementById("auth-user").focus();}
  function hideAuth(){document.getElementById("auth-overlay").style.display="none";_authCallback=null;}
  function onAuthenticated(){hideAuth();connectSSE();}
  document.getElementById("auth-form").addEventListener("submit",function(e){
    e.preventDefault();var u=document.getElementById("auth-user").value,p=document.getElementById("auth-pass").value;
    fetch("/auth-check",{method:"POST",headers:{"Authorization":"Basic "+btoa(u+":"+p)}}).then(function(r){
      if(r.status===401){document.getElementById("auth-error").textContent="Invalid credentials";document.getElementById("auth-error").style.display="block";return;}
      saveCreds(u,p);onAuthenticated();
      if(_authCallback){var cb=_authCallback;_authCallback=null;cb();}
    }).catch(function(){document.getElementById("auth-error").textContent="Connection error";document.getElementById("auth-error").style.display="block";});
  });
  function requireAuth(cb){if(loadCreds()){cb();return;}showAuth(cb);}
  function authFetch(url,opts){var c=loadCreds();if(!c)return Promise.reject(new Error("Not logged in"));opts=opts||{};opts.headers=opts.headers||{};opts.headers["Authorization"]=c.basic;return fetch(url,opts);}

  // Check cached creds on page load
  var cached=loadCreds();
  if(cached){
    fetch("/auth-check",{method:"POST",headers:{"Authorization":cached.basic}})
      .then(function(r){if(r.ok)onAuthenticated();else{_creds=null;sessionStorage.removeItem("cb_auth");document.getElementById("auth-user").focus();}})
      .catch(function(){onAuthenticated();});
  } else {
    document.getElementById("auth-user").focus();
  }

  // ── Resume / Send ─────────────────────────────────────────────
  window.resumeSession=function(){
    requireAuth(function(){
      var input=document.getElementById("resume-prompt");
      var prompt=(input&&input.value.trim())||"Continue from where you left off.";
      var btn=document.getElementById("resume-btn");
      if(btn){btn.disabled=true;btn.textContent="Starting\u2026";}
      authFetch("/s/"+ID+"/resume",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:prompt})}).then(function(r){return r.json();}).then(function(d){
        if(d.ok){showUserMessage(prompt);if(input)input.value="";updateReplyBar(true);currentStatus="running";
          var ti=document.createElement("div");ti.className="typing";ti.id="typing-indicator";
          ti.innerHTML='<div class="typing-dots"><span></span><span></span><span></span></div><span class="typing-label">working\u2026</span>';
          chatArea.appendChild(ti);chatArea.scrollTop=chatArea.scrollHeight;
        }else{alert(d.message||"Could not resume.");if(btn){btn.disabled=false;btn.textContent="Send";}}
      }).catch(function(e){alert("Error: "+e.message);if(btn){btn.disabled=false;btn.textContent="Send";}});
    });
  };

  // Ctrl+Enter / Cmd+Enter to send or queue
  var resumeInput=document.getElementById("resume-prompt");
  if(resumeInput){
    resumeInput.addEventListener("keydown",function(e){
      if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();
        if(currentStatus==="running"||currentStatus==="interactive")queueMessage();else resumeSession();}
    });
    // Auto-resize textarea
    resumeInput.addEventListener("input",function(){this.style.height="44px";this.style.height=Math.min(this.scrollHeight,120)+"px";});
  }

  window.cancelSession=function(){
    if(!confirm("Cancel this session?"))return;
    requireAuth(function(){authFetch("/s/"+ID+"/cancel",{method:"POST"}).then(function(r){return r.json();}).then(function(d){
      if(d.ok)location.reload();else alert(d.message||"Could not cancel.");
    }).catch(function(e){alert("Error: "+e.message);});});
  };

})();
</script>
</body></html>`;
}

// ── Dashboard Page ─────────────────────────────────────────────

export interface WorkspaceCard {
  worktreeId: string;
  name: string | null;
  resolved: boolean;
  alive: boolean;
  status: string;
  exitCode: number | null;
  user: string;
  prompt: string;
  started: string | null;
  baseBranch: string;
  channelName: string;
  runCount: number;
  profile?: string;
}

const DASHBOARD_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#ccc;font-family:'SF Mono',Monaco,'Cascadia Code',monospace;font-size:13px;line-height:1.5;height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

/* Header */
.header{padding:10px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;flex-shrink:0;background:#0d0d0d;flex-wrap:wrap}
.header-title{font-weight:bold;color:#5FA7F1;font-size:15px}
.header-spacer{flex:1}
.header-item{display:flex;align-items:center;gap:6px;font-size:12px}
.capacity{color:#666;font-size:11px;padding:3px 8px;background:#111;border:1px solid #222;border-radius:3px}

/* Identity picker */
.identity-select{background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer}
.identity-select:focus{outline:none;border-color:#5FA7F1}
.identity-label{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}

/* Buttons */
.btn{background:#151515;color:#ccc;border:1px solid #333;border-radius:4px;padding:5px 14px;font-family:inherit;font-size:12px;cursor:pointer;transition:all 0.15s}
.btn:hover{background:#222;color:#fff}
.btn:disabled{color:#444;border-color:#222;cursor:default;background:#0d0d0d}
.btn-green{border-color:#61D668;color:#61D668}.btn-green:hover{background:#0d1f0d}
.btn-blue{border-color:#5FA7F1;color:#5FA7F1}.btn-blue:hover{background:#0d0d1f}
.btn-red{border-color:#E94560;color:#E94560}.btn-red:hover{background:#1f0d0d}
.btn-sm{padding:3px 8px;font-size:11px}

/* Main content */
.main{flex:1;overflow-y:auto;padding:16px}

/* Section headers */
.section{margin-bottom:20px}
.section-header{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;padding:0 0 8px;border-bottom:1px solid #1a1a1a;margin-bottom:10px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.section-header .count{color:#444;font-weight:normal}
.section-header .toggle{color:#444;font-size:10px}
.section-header.running-header{color:#61D668}
.section-header.resolved-header{color:#888}

/* Card grid */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}

/* Cards */
.card{background:#111;border:1px solid #222;border-radius:6px;padding:12px 14px;cursor:pointer;transition:border-color 0.15s;position:relative}
.card:hover{border-color:#444}
.card.running{border-left:3px solid #61D668}
.card.interactive{border-left:3px solid #FAD979}
.card.error{border-left:3px solid #E94560}
.card.resolved{opacity:0.6}
.card.deleted{opacity:0.4}
.card-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px}
.card-name{font-size:13px;font-weight:bold;color:#ddd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-name.editing{background:#0a0a0a;border:1px solid #5FA7F1;border-radius:3px;padding:2px 6px;outline:none;white-space:normal;font-weight:normal}
.card-status{display:flex;align-items:center;gap:4px;font-size:11px;flex-shrink:0}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.status-dot.running{background:#61D668;animation:pulse 2s infinite}
.status-dot.interactive{background:#FAD979;animation:pulse 2s infinite}
.status-dot.completed{background:#61D668}
.status-dot.error{background:#E94560}
.status-dot.cancelled,.status-dot.interrupted,.status-dot.unknown{background:#666}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.card-meta{display:flex;gap:12px;font-size:11px;color:#666;flex-wrap:wrap}
.card-meta span{white-space:nowrap}
.card-prompt{font-size:11px;color:#555;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.card-badges{display:flex;gap:4px;margin-top:6px}
.badge{font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid}
.badge-deleted{color:#888;border-color:#333;background:#1a1a1a}
.badge-resolved{color:#61D668;border-color:#1a331a;background:#0d1a0d}
.badge-channel{color:#FAD979;border-color:#333020;background:#1a1a0a}

/* Kebab menu */
.kebab{color:#444;cursor:pointer;padding:2px 6px;font-size:16px;line-height:1;border-radius:3px;flex-shrink:0}
.kebab:hover{color:#ccc;background:#222}
.menu{position:absolute;right:8px;top:32px;background:#1a1a1a;border:1px solid #333;border-radius:4px;z-index:10;min-width:140px;box-shadow:0 4px 12px rgba(0,0,0,0.5)}
.menu-item{padding:6px 12px;font-size:12px;cursor:pointer;color:#ccc;display:block;width:100%;text-align:left;background:none;border:none;font-family:inherit}
.menu-item:hover{background:#222}
.menu-item.danger{color:#E94560}
.menu-item.danger:hover{background:#1f0d0d}

/* New session modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100;display:none;align-items:center;justify-content:center}
.modal-overlay.visible{display:flex}
.modal{background:#111;border:1px solid #333;border-radius:8px;padding:24px;width:420px;max-width:90vw;display:flex;flex-direction:column;gap:14px}
.modal-title{color:#5FA7F1;font-weight:bold;font-size:14px}
.form-row{display:flex;flex-direction:column;gap:4px}
.form-label{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666}
.form-input{background:#0a0a0a;border:1px solid #333;border-radius:4px;padding:8px 12px;color:#ccc;font-family:inherit;font-size:13px;resize:none}
.form-input:focus{outline:none;border-color:#5FA7F1}
.form-input.textarea{height:100px}
.form-select{background:#0a0a0a;border:1px solid #333;border-radius:4px;padding:8px 12px;color:#ccc;font-family:inherit;font-size:13px}
.form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.form-error{color:#E94560;font-size:11px;display:none}

/* Empty state */
.empty{text-align:center;color:#444;padding:40px 20px;font-size:13px}

/* Responsive */
@media(max-width:480px){.card-grid{grid-template-columns:1fr}.header{gap:8px}}
`;

export function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox Dashboard</title>
<style>${DASHBOARD_STYLES}</style>
</head>
<body>

<!-- Auth overlay -->
<div id="auth-overlay" class="modal-overlay visible">
  <form id="auth-form" class="modal" autocomplete="on" style="width:280px">
    <div class="modal-title" style="text-align:center">ClaudeBox Login</div>
    <input id="auth-user" name="username" type="text" autocomplete="username" placeholder="Username" class="form-input" required>
    <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" class="form-input" required>
    <button type="submit" class="btn btn-blue" style="width:100%;padding:8px">Login</button>
    <div id="auth-error" class="form-error"></div>
  </form>
</div>

<!-- Header -->
<div class="header" id="app-header" style="display:none">
  <span class="header-title">CLAUDEBOX</span>
  <span class="header-spacer"></span>
  <div class="header-item">
    <span class="identity-label">as</span>
    <select id="identity-select" class="identity-select"><option value="">Loading...</option></select>
  </div>
  <span id="capacity" class="capacity"></span>
  <button id="new-btn" class="btn btn-green">+ New</button>
</div>

<!-- Main content -->
<div class="main" id="app-main" style="display:none">
  <div id="ws-container"></div>
</div>

<!-- New session modal -->
<div id="new-modal" class="modal-overlay">
  <form id="new-form" class="modal">
    <div class="modal-title">New Session</div>
    <div class="form-row">
      <label class="form-label">What should ClaudeBox work on?</label>
      <textarea id="new-prompt" class="form-input textarea" placeholder="Describe the task..." required></textarea>
    </div>
    <div class="form-row">
      <label class="form-label">Task name (optional)</label>
      <input id="new-name" class="form-input" type="text" placeholder="e.g., Fix authentication bug">
    </div>
    <div class="form-row">
      <label class="form-label">Branch</label>
      <select id="new-branch" class="form-select"><option value="next">next</option></select>
    </div>
    <div class="form-row">
      <label class="form-label">As</label>
      <span id="new-user" style="color:#ccc"></span>
    </div>
    <div id="new-error" class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" onclick="closeNewModal()">Cancel</button>
      <button type="submit" class="btn btn-green" id="new-submit">Start Session</button>
    </div>
  </form>
</div>

<script>
(function(){
  // ── Auth ─────────────────────────────────────────────
  var _creds=null;
  function loadCreds(){
    if(_creds)return _creds;
    try{var s=sessionStorage.getItem("cb_auth");if(s){_creds=JSON.parse(s);return _creds;}}catch{}
    return null;
  }
  function saveCreds(u,p){
    _creds={user:u,pass:p,basic:"Basic "+btoa(u+":"+p)};
    try{sessionStorage.setItem("cb_auth",JSON.stringify(_creds));}catch{}
    return _creds;
  }
  function authFetch(url,opts){
    var c=loadCreds();if(!c)return Promise.reject(new Error("Not authenticated"));
    opts=opts||{};opts.headers=Object.assign({"Authorization":c.basic},opts.headers||{});
    return fetch(url,opts);
  }
  function showApp(){
    document.getElementById("auth-overlay").classList.remove("visible");
    document.getElementById("app-header").style.display="flex";
    document.getElementById("app-main").style.display="block";
    loadDashboard();
    loadUsers();
    loadBranches();
  }

  // Check cached creds on load
  var cached=loadCreds();
  if(cached){
    fetch("/auth-check",{method:"POST",headers:{"Authorization":cached.basic}})
      .then(function(r){if(r.ok)showApp();else{_creds=null;sessionStorage.removeItem("cb_auth");document.getElementById("auth-user").focus();}})
      .catch(function(){showApp();});
  } else {
    document.getElementById("auth-user").focus();
  }

  document.getElementById("auth-form").addEventListener("submit",function(e){
    e.preventDefault();
    var u=document.getElementById("auth-user").value, p=document.getElementById("auth-pass").value;
    fetch("/auth-check",{method:"POST",headers:{"Authorization":"Basic "+btoa(u+":"+p)}})
      .then(function(r){
        if(r.status===401){var el=document.getElementById("auth-error");el.textContent="Invalid credentials";el.style.display="block";return;}
        saveCreds(u,p);showApp();
      }).catch(function(){var el=document.getElementById("auth-error");el.textContent="Connection error";el.style.display="block";});
  });

  // ── Identity ─────────────────────────────────────────
  var identitySelect=document.getElementById("identity-select");
  function getIdentity(){return localStorage.getItem("cb_identity")||"";}
  function setIdentity(v){localStorage.setItem("cb_identity",v);}

  function loadUsers(){
    authFetch("/api/users").then(function(r){return r.json();}).then(function(d){
      identitySelect.innerHTML="";
      var stored=getIdentity();
      var found=false;
      (d.users||[]).forEach(function(u){
        var o=document.createElement("option");o.value=u;o.textContent=u;
        if(u===stored){o.selected=true;found=true;}
        identitySelect.appendChild(o);
      });
      if(!found&&d.users&&d.users.length){
        identitySelect.value=d.users[0];
        setIdentity(d.users[0]);
      }
    }).catch(function(){});
  }
  identitySelect.addEventListener("change",function(){setIdentity(identitySelect.value);});

  // ── Branches ─────────────────────────────────────────
  function loadBranches(){
    authFetch("/api/branches").then(function(r){return r.json();}).then(function(d){
      var sel=document.getElementById("new-branch");
      sel.innerHTML="";
      (d.branches||["next"]).forEach(function(b){
        var o=document.createElement("option");o.value=b;o.textContent=b;
        sel.appendChild(o);
      });
    }).catch(function(){});
  }

  // ── Dashboard rendering ──────────────────────────────
  var _workspaces=[];
  var _openMenu=null;
  var _resolvedExpanded=false;

  function timeAgo(iso){
    var ms=Date.now()-new Date(iso).getTime();
    if(ms<60000)return "just now";
    if(ms<3600000)return Math.floor(ms/60000)+"m ago";
    if(ms<86400000)return Math.floor(ms/3600000)+"h ago";
    return Math.floor(ms/86400000)+"d ago";
  }

  function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

  function loadDashboard(){
    authFetch("/api/dashboard").then(function(r){return r.json();}).then(function(d){
      _workspaces=d.workspaces||[];
      document.getElementById("capacity").textContent=d.activeCount+"/"+d.maxConcurrent+" active";
      document.getElementById("new-btn").disabled=d.activeCount>=d.maxConcurrent;
      renderWorkspaces();
    }).catch(function(){});
  }

  function renderWorkspaces(){
    var running=[],recent=[],resolved=[];
    _workspaces.forEach(function(w){
      if(w.status==="running"||w.status==="interactive")running.push(w);
      else if(w.resolved)resolved.push(w);
      else recent.push(w);
    });

    var html="";

    if(running.length){
      html+='<div class="section"><div class="section-header running-header">Running <span class="count">('+running.length+')</span></div>';
      html+='<div class="card-grid">'+running.map(renderCard).join("")+'</div></div>';
    }

    html+='<div class="section"><div class="section-header">Recent <span class="count">('+recent.length+')</span></div>';
    if(recent.length){
      html+='<div class="card-grid">'+recent.map(renderCard).join("")+'</div>';
    } else {
      html+='<div class="empty">No recent workspaces</div>';
    }
    html+='</div>';

    if(resolved.length){
      html+='<div class="section"><div class="section-header resolved-header" onclick="toggleResolved()">Resolved <span class="count">('+resolved.length+')</span> <span class="toggle">'+(_resolvedExpanded?"\u25BC":"\u25B6")+'</span></div>';
      if(_resolvedExpanded){
        html+='<div class="card-grid">'+resolved.map(renderCard).join("")+'</div>';
      }
      html+='</div>';
    }

    document.getElementById("ws-container").innerHTML=html;
  }

  window.toggleResolved=function(){_resolvedExpanded=!_resolvedExpanded;renderWorkspaces();};

  function renderCard(w){
    var cls="card";
    if(w.status==="running"||w.status==="interactive")cls+=" "+w.status;
    if(w.status==="error")cls+=" error";
    if(w.resolved)cls+=" resolved";
    if(!w.alive)cls+=" deleted";

    var displayName=w.name||w.prompt||"Unnamed workspace";
    if(displayName.length>80)displayName=displayName.slice(0,80)+"\u2026";

    var exitStr=w.exitCode!=null?" ("+w.exitCode+")":"";

    var badges="";
    if(!w.alive)badges+='<span class="badge badge-deleted">deleted</span>';
    if(w.resolved)badges+='<span class="badge badge-resolved">resolved</span>';
    if(w.channelName)badges+='<span class="badge badge-channel">#'+esc(w.channelName)+'</span>';

    var q="\\x27";
    return '<div class="'+cls+'" data-id="'+w.worktreeId+'" onclick="openWorkspace(event,'+q+w.worktreeId+q+')">'
      +'<div class="card-top">'
      +'<div class="card-name" id="name-'+w.worktreeId+'">'+esc(displayName)+'</div>'
      +'<div class="card-status"><span class="status-dot '+w.status+'"></span><span>'+w.status+exitStr+'</span></div>'
      +'<span class="kebab" onclick="toggleMenu(event,'+q+w.worktreeId+q+')">&#8942;</span>'
      +'</div>'
      +'<div class="card-meta">'
      +'<span>'+esc(w.user)+'</span>'
      +'<span>'+esc(w.baseBranch)+'</span>'
      +'<span>'+w.runCount+' run'+(w.runCount!==1?"s":"")+'</span>'
      +'<span>'+(w.started?timeAgo(w.started):"\u2014")+'</span>'
      +'</div>'
      +(w.name&&w.prompt?'<div class="card-prompt">'+esc(w.prompt.length>100?w.prompt.slice(0,100)+"\u2026":w.prompt)+'</div>':"")
      +(badges?'<div class="card-badges">'+badges+'</div>':"")
      +'<div class="menu" id="menu-'+w.worktreeId+'" style="display:none">'
      +'<button class="menu-item" onclick="renameWorkspace(event,'+q+w.worktreeId+q+')">Rename</button>'
      +'<button class="menu-item" onclick="resolveWorkspace(event,'+q+w.worktreeId+q+','+(!w.resolved)+')">'+(w.resolved?"Unresolve":"Resolve")+'</button>'
      +(w.alive&&w.status!=="running"&&w.status!=="interactive"?'<button class="menu-item danger" onclick="deleteWorkspace(event,'+q+w.worktreeId+q+')">Delete</button>':"")
      +'</div>'
      +'</div>';
  }

  // ── Card actions ─────────────────────────────────────
  window.openWorkspace=function(e,id){
    if(e.target.closest(".kebab")||e.target.closest(".menu")||e.target.classList.contains("card-name")&&e.target.contentEditable==="true")return;
    location.href="/s/"+id;
  };

  window.toggleMenu=function(e,id){
    e.stopPropagation();
    // Close any open menu
    if(_openMenu&&_openMenu!==id){
      var prev=document.getElementById("menu-"+_openMenu);
      if(prev)prev.style.display="none";
    }
    var menu=document.getElementById("menu-"+id);
    if(!menu)return;
    var visible=menu.style.display!=="none";
    menu.style.display=visible?"none":"block";
    _openMenu=visible?null:id;
  };

  // Close menus on click outside
  document.addEventListener("click",function(e){
    if(_openMenu&&!e.target.closest(".kebab")&&!e.target.closest(".menu")){
      var m=document.getElementById("menu-"+_openMenu);
      if(m)m.style.display="none";
      _openMenu=null;
    }
  });

  window.renameWorkspace=function(e,id){
    e.stopPropagation();
    var m=document.getElementById("menu-"+id);if(m)m.style.display="none";_openMenu=null;
    var el=document.getElementById("name-"+id);if(!el)return;
    var oldName=el.textContent;
    el.contentEditable="true";
    el.classList.add("editing");
    el.focus();
    // Select all text
    var range=document.createRange();range.selectNodeContents(el);
    var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);

    function save(){
      el.contentEditable="false";
      el.classList.remove("editing");
      var newName=el.textContent.trim();
      if(!newName||newName===oldName)return;
      authFetch("/s/"+id+"/name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newName})})
        .then(function(r){if(!r.ok)el.textContent=oldName;else loadDashboard();})
        .catch(function(){el.textContent=oldName;});
    }
    el.addEventListener("blur",save,{once:true});
    el.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"){ev.preventDefault();el.blur();}
      if(ev.key==="Escape"){el.textContent=oldName;el.blur();}
    });
  };

  window.resolveWorkspace=function(e,id,resolved){
    e.stopPropagation();
    var m=document.getElementById("menu-"+id);if(m)m.style.display="none";_openMenu=null;
    authFetch("/s/"+id+"/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolved:resolved})})
      .then(function(){loadDashboard();}).catch(function(){});
  };

  window.deleteWorkspace=function(e,id){
    e.stopPropagation();
    var m=document.getElementById("menu-"+id);if(m)m.style.display="none";_openMenu=null;
    if(!confirm("Delete this workspace? This frees disk space but cannot be undone."))return;
    authFetch("/s/"+id,{method:"DELETE"})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok)loadDashboard();else alert(d.message||"Could not delete");
      }).catch(function(e){alert("Error: "+e.message);});
  };

  // ── New session modal ────────────────────────────────
  document.getElementById("new-btn").addEventListener("click",function(){
    document.getElementById("new-user").textContent=getIdentity()||"(select identity above)";
    document.getElementById("new-modal").classList.add("visible");
    document.getElementById("new-prompt").focus();
  });

  window.closeNewModal=function(){
    document.getElementById("new-modal").classList.remove("visible");
    document.getElementById("new-error").style.display="none";
  };

  document.getElementById("new-form").addEventListener("submit",function(e){
    e.preventDefault();
    var prompt=document.getElementById("new-prompt").value.trim();
    var name=document.getElementById("new-name").value.trim();
    var branch=document.getElementById("new-branch").value;
    var user=getIdentity();
    if(!prompt)return;
    var btn=document.getElementById("new-submit");
    btn.disabled=true;btn.textContent="Starting...";
    authFetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt:prompt,name:name||undefined,base_branch:branch,user:user||undefined})})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok&&d.worktree_id){
          closeNewModal();
          location.href="/s/"+d.worktree_id;
        } else {
          var err=document.getElementById("new-error");
          err.textContent=d.message||d.error||"Failed to start session";
          err.style.display="block";
          btn.disabled=false;btn.textContent="Start Session";
        }
      }).catch(function(err){
        var el=document.getElementById("new-error");
        el.textContent="Connection error: "+err.message;el.style.display="block";
        btn.disabled=false;btn.textContent="Start Session";
      });
  });

  // Close modal on Escape
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      var nm=document.getElementById("new-modal");
      if(nm.classList.contains("visible"))closeNewModal();
    }
  });

  // ── Auto-refresh ─────────────────────────────────────
  setInterval(function(){
    if(document.visibilityState!=="visible")return;
    if(!loadCreds())return;
    if(document.getElementById("new-modal").classList.contains("visible"))return;
    loadDashboard();
  },10000);
})();
</script>
</body></html>`;
}

/** Audit dashboard — shows only barretenberg-audit profile sessions. */
export function auditDashboardHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox Audit</title>
<style>${DASHBOARD_STYLES}
/* Questions panel */
.q-panel{margin-bottom:16px}
.q-panel .section-header{cursor:pointer;user-select:none}
.q-card{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:12px;margin-bottom:12px}
.q-card.pending{border-color:#d876e3}
.q-card.answered{border-color:#61D668;opacity:0.7}
.q-card.expired{border-color:#E94560;opacity:0.5}
.q-desc{font-weight:bold;color:#e0e0e0;margin-bottom:2px}
.q-text{font-size:13px;color:#ccc;margin-bottom:6px}
.q-meta{font-size:11px;color:#888;margin-bottom:8px}
.q-meta a{color:#7aa2f7}
.q-context{font-size:12px;color:#999;margin-bottom:8px;padding:6px 8px;background:#111;border-radius:4px;border-left:3px solid #555}
.q-body-detail{font-size:12px;color:#aaa;white-space:pre-wrap;margin-bottom:8px;max-height:150px;overflow-y:auto;padding:6px 8px;background:#0d0d0d;border-radius:4px}
.q-urgency{display:inline-block;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;margin-right:6px}
.q-urgency.critical{background:rgba(233,69,96,0.2);color:#E94560;border:1px solid rgba(233,69,96,0.3)}
.q-urgency.important{background:rgba(250,217,121,0.15);color:#FAD979;border:1px solid rgba(250,217,121,0.25)}
.q-urgency.nice-to-have{background:rgba(136,136,136,0.15);color:#aaa;border:1px solid rgba(136,136,136,0.25)}
.q-countdown{font-size:11px;font-family:'SF Mono',monospace;color:#888;font-variant-numeric:tabular-nums}
.q-countdown.urgent{color:#E94560}
.q-countdown.expired{color:#666}
.q-options{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.q-option{display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:#111;border:1px solid #333;border-radius:4px;cursor:pointer;transition:all 0.15s}
.q-option:hover{border-color:#7aa2f7;background:#0d1a2e}
.q-option.selected{border-color:#d876e3;background:rgba(216,118,227,0.08)}
.q-option input[type="radio"]{margin-top:3px;accent-color:#d876e3}
.q-option-label{font-size:12px;font-weight:600;color:#ddd}
.q-option-desc{font-size:11px;color:#999}
.q-freeform{background:#111;border:1px solid #444;border-radius:4px;color:#ccc;font-family:monospace;font-size:12px;padding:8px;min-height:50px;resize:vertical;width:100%;box-sizing:border-box}
.q-freeform:focus{border-color:#7aa2f7;outline:none}
.q-answer-btn{background:#d876e3;color:#000;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold}
.q-answer-btn:hover{background:#e99cf0}
.q-answer-btn:disabled{opacity:0.5;cursor:default}
.q-answer-ok{color:#61D668;font-size:12px;padding:4px 0}
.q-direction{margin-top:12px;padding:12px;background:#111;border:1px solid #333;border-radius:6px}
.q-direction label{font-size:11px;color:#888;display:block;margin-bottom:4px}
.q-direction textarea{background:#0d0d0d;border:1px solid #444;border-radius:4px;color:#ccc;font-family:monospace;font-size:12px;padding:8px;min-height:60px;resize:vertical;width:100%;box-sizing:border-box}
.q-direction textarea:focus{border-color:#7aa2f7;outline:none}
.q-direction button{margin-top:6px}
/* Findings summary */
.findings-bar{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.finding-stat{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:8px 14px;font-size:12px}
.finding-stat .count{font-size:18px;font-weight:bold;margin-right:4px}
.finding-stat.open .count{color:#E94560}
.finding-stat.closed .count{color:#61D668}
/* Coverage panel */
.cov-bar{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.cov-stat{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:8px 14px;font-size:12px}
.cov-stat .count{font-size:18px;font-weight:bold;margin-right:4px;color:#7aa2f7}
.cov-modules{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:12px}
.cov-mod{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:10px 14px;cursor:pointer;transition:border-color 0.15s}
.cov-mod:hover{border-color:#7aa2f7}
.cov-mod-name{font-weight:600;color:#e0e0e0;margin-bottom:4px}
.cov-mod-meta{font-size:11px;color:#888;display:flex;gap:12px}
.cov-mod-meta .issues{color:#E94560}
.cov-depth{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;margin-right:4px}
.cov-depth.deep{background:rgba(97,214,104,0.15);color:#61D668;border:1px solid rgba(97,214,104,0.25)}
.cov-depth.line-by-line{background:rgba(122,162,247,0.15);color:#7aa2f7;border:1px solid rgba(122,162,247,0.25)}
.cov-depth.cursory{background:rgba(136,136,136,0.15);color:#aaa;border:1px solid rgba(136,136,136,0.25)}
.cov-files{display:none;margin-top:8px;border-top:1px solid #333;padding-top:8px}
.cov-files.open{display:block}
.cov-file{font-size:11px;color:#999;padding:3px 0;display:flex;gap:8px;align-items:center}
.cov-file-path{color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cov-file-notes{font-size:10px;color:#666;padding-left:16px}
/* Findings list */
.findings-list{margin-top:8px}
.finding-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;color:#ccc;text-decoration:none;transition:background 0.15s}
.finding-row:hover{background:#1a1a1a;text-decoration:none}
.finding-row.closed{opacity:0.5}
.finding-number{color:#888;font-size:11px;flex-shrink:0;min-width:32px}
.finding-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.finding-label{font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid #333;color:#aaa;flex-shrink:0}
.cov-summaries{margin-top:12px}
.cov-summary{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:10px 14px;margin-bottom:8px}
.cov-summary-text{font-size:12px;color:#ccc;margin-bottom:4px}
.cov-summary-meta{font-size:11px;color:#888;display:flex;gap:12px}
</style>
</head>
<body>

<!-- Auth overlay -->
<div id="auth-overlay" class="modal-overlay visible">
  <form id="auth-form" class="modal" autocomplete="on" style="width:280px">
    <div class="modal-title" style="text-align:center">ClaudeBox Audit Login</div>
    <input id="auth-user" name="username" type="text" autocomplete="username" placeholder="Username" class="form-input" required>
    <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" class="form-input" required>
    <button type="submit" class="btn btn-blue" style="width:100%;padding:8px">Login</button>
    <div id="auth-error" class="form-error"></div>
  </form>
</div>

<!-- Header -->
<div class="header" id="app-header" style="display:none">
  <span class="header-title">CLAUDEBOX AUDIT</span>
  <span class="header-spacer"></span>
  <a href="/dashboard" style="color:#888;margin-right:12px">\u2190 Main Dashboard</a>
  <div class="header-item">
    <span class="identity-label">as</span>
    <select id="identity-select" class="identity-select"><option value="">Loading...</option></select>
  </div>
  <span id="capacity" class="capacity"></span>
  <button id="new-btn" class="btn btn-green">+ New Audit</button>
</div>

<!-- Main content -->
<div class="main" id="app-main" style="display:none">
  <div id="questions-panel"></div>
  <div id="findings-summary"></div>
  <div id="coverage-panel"></div>
  <div id="ws-container"></div>
</div>

<!-- New audit session modal -->
<div id="new-modal" class="modal-overlay">
  <form id="new-form" class="modal">
    <div class="modal-title">New Audit Session</div>
    <div class="form-row">
      <label class="form-label">What should be audited?</label>
      <textarea id="new-prompt" class="form-input textarea" placeholder="e.g., Review the polynomial commitment code for memory safety issues..." required></textarea>
    </div>
    <div class="form-row">
      <label class="form-label">Task name (optional)</label>
      <input id="new-name" class="form-input" type="text" placeholder="e.g., Audit polynomial commitments">
    </div>
    <div class="form-row">
      <label class="form-label">Target ref</label>
      <input id="new-branch" class="form-input" type="text" value="main" placeholder="main">
    </div>
    <div class="form-row">
      <label class="form-label">As</label>
      <span id="new-user" style="color:#ccc"></span>
    </div>
    <div id="new-error" class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" onclick="closeNewModal()">Cancel</button>
      <button type="submit" class="btn btn-green" id="new-submit">Start Audit</button>
    </div>
  </form>
</div>

<script>
(function(){
  var _creds=null;
  function loadCreds(){
    if(_creds)return _creds;
    try{var s=sessionStorage.getItem("cb_auth");if(s){_creds=JSON.parse(s);return _creds;}}catch{}
    return null;
  }
  function saveCreds(u,p){
    _creds={user:u,pass:p,basic:"Basic "+btoa(u+":"+p)};
    try{sessionStorage.setItem("cb_auth",JSON.stringify(_creds));}catch{}
    return _creds;
  }
  function authFetch(url,opts){
    var c=loadCreds();if(!c)return Promise.reject(new Error("Not authenticated"));
    opts=opts||{};opts.headers=Object.assign({"Authorization":c.basic},opts.headers||{});
    return fetch(url,opts);
  }
  function showApp(){
    document.getElementById("auth-overlay").classList.remove("visible");
    document.getElementById("app-header").style.display="flex";
    document.getElementById("app-main").style.display="block";
    loadDashboard();
    loadUsers();
    loadQuestions();
    loadFindings();
    loadCoverage();
  }

  var cached=loadCreds();
  if(cached){
    fetch("/auth-check",{method:"POST",headers:{"Authorization":cached.basic}})
      .then(function(r){if(r.ok)showApp();else{_creds=null;sessionStorage.removeItem("cb_auth");document.getElementById("auth-user").focus();}})
      .catch(function(){showApp();});
  } else {
    document.getElementById("auth-user").focus();
  }

  document.getElementById("auth-form").addEventListener("submit",function(e){
    e.preventDefault();
    var u=document.getElementById("auth-user").value, p=document.getElementById("auth-pass").value;
    fetch("/auth-check",{method:"POST",headers:{"Authorization":"Basic "+btoa(u+":"+p)}})
      .then(function(r){
        if(r.status===401){var el=document.getElementById("auth-error");el.textContent="Invalid credentials";el.style.display="block";return;}
        saveCreds(u,p);showApp();
      }).catch(function(){var el=document.getElementById("auth-error");el.textContent="Connection error";el.style.display="block";});
  });

  var identitySelect=document.getElementById("identity-select");
  function getIdentity(){return localStorage.getItem("cb_identity")||"";}
  function setIdentity(v){localStorage.setItem("cb_identity",v);}

  function loadUsers(){
    authFetch("/api/users").then(function(r){return r.json();}).then(function(d){
      identitySelect.innerHTML="";
      var stored=getIdentity();
      var found=false;
      (d.users||[]).forEach(function(u){
        var o=document.createElement("option");o.value=u;o.textContent=u;
        if(u===stored){o.selected=true;found=true;}
        identitySelect.appendChild(o);
      });
      if(!found&&d.users&&d.users.length){
        identitySelect.value=d.users[0];
        setIdentity(d.users[0]);
      }
    }).catch(function(){});
  }
  identitySelect.addEventListener("change",function(){setIdentity(identitySelect.value);});

  var _workspaces=[];
  var _openMenu=null;

  function timeAgo(iso){
    var ms=Date.now()-new Date(iso).getTime();
    if(ms<60000)return "just now";
    if(ms<3600000)return Math.floor(ms/60000)+"m ago";
    if(ms<86400000)return Math.floor(ms/3600000)+"h ago";
    return Math.floor(ms/86400000)+"d ago";
  }

  function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

  function loadDashboard(){
    authFetch("/api/dashboard?profile=barretenberg-audit").then(function(r){return r.json();}).then(function(d){
      _workspaces=d.workspaces||[];
      document.getElementById("capacity").textContent=d.activeCount+"/"+d.maxConcurrent+" active";
      document.getElementById("new-btn").disabled=d.activeCount>=d.maxConcurrent;
      renderWorkspaces();
    }).catch(function(){});
  }

  function renderWorkspaces(){
    var running=[],recent=[];
    _workspaces.forEach(function(w){
      if(w.status==="running"||w.status==="interactive")running.push(w);
      else recent.push(w);
    });

    var html="";
    if(running.length){
      html+='<div class="section"><div class="section-header running-header">Running <span class="count">('+running.length+')</span></div>';
      html+='<div class="card-grid">'+running.map(renderCard).join("")+'</div></div>';
    }
    html+='<div class="section"><div class="section-header">Audit Sessions <span class="count">('+recent.length+')</span></div>';
    if(recent.length){
      html+='<div class="card-grid">'+recent.map(renderCard).join("")+'</div>';
    } else {
      html+='<div class="empty">No audit sessions yet</div>';
    }
    html+='</div>';
    document.getElementById("ws-container").innerHTML=html;
  }

  function renderCard(w){
    var cls="card";
    if(w.status==="running"||w.status==="interactive")cls+=" "+w.status;
    if(w.status==="error")cls+=" error";
    if(!w.alive)cls+=" deleted";

    var displayName=w.name||w.prompt||"Unnamed audit";
    if(displayName.length>80)displayName=displayName.slice(0,80)+"\u2026";
    var exitStr=w.exitCode!=null?" ("+w.exitCode+")":"";
    var badges="";
    if(!w.alive)badges+='<span class="badge badge-deleted">deleted</span>';
    if(w.channelName)badges+='<span class="badge badge-channel">#'+esc(w.channelName)+'</span>';

    var q="\\x27";
    return '<div class="'+cls+'" data-id="'+w.worktreeId+'" onclick="openWorkspace(event,'+q+w.worktreeId+q+')">'
      +'<div class="card-top">'
      +'<div class="card-name">'+esc(displayName)+'</div>'
      +'<div class="card-status"><span class="status-dot '+w.status+'"></span><span>'+w.status+exitStr+'</span></div>'
      +'</div>'
      +'<div class="card-meta">'
      +'<span>'+esc(w.user)+'</span>'
      +'<span>'+w.runCount+' run'+(w.runCount!==1?"s":"")+'</span>'
      +'<span>'+(w.started?timeAgo(w.started):"\u2014")+'</span>'
      +'</div>'
      +(badges?'<div class="card-badges">'+badges+'</div>':"")
      +'</div>';
  }

  window.openWorkspace=function(e,id){location.href="/s/"+id;};

  document.getElementById("new-btn").addEventListener("click",function(){
    document.getElementById("new-user").textContent=getIdentity()||"(select identity above)";
    document.getElementById("new-modal").classList.add("visible");
    document.getElementById("new-prompt").focus();
  });

  window.closeNewModal=function(){
    document.getElementById("new-modal").classList.remove("visible");
    document.getElementById("new-error").style.display="none";
  };

  document.getElementById("new-form").addEventListener("submit",function(e){
    e.preventDefault();
    var prompt=document.getElementById("new-prompt").value.trim();
    var name=document.getElementById("new-name").value.trim();
    var branch=document.getElementById("new-branch").value;
    var user=getIdentity();
    if(!prompt)return;
    var btn=document.getElementById("new-submit");
    btn.disabled=true;btn.textContent="Starting...";
    authFetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt:prompt,name:name||undefined,base_branch:branch,user:user||undefined,profile:"barretenberg-audit"})})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok&&d.worktree_id){
          closeNewModal();
          location.href="/s/"+d.worktree_id;
        } else {
          var err=document.getElementById("new-error");
          err.textContent=d.message||d.error||"Failed to start session";
          err.style.display="block";
          btn.disabled=false;btn.textContent="Start Audit";
        }
      }).catch(function(err){
        var el=document.getElementById("new-error");
        el.textContent="Connection error: "+err.message;el.style.display="block";
        btn.disabled=false;btn.textContent="Start Audit";
      });
  });

  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      var nm=document.getElementById("new-modal");
      if(nm.classList.contains("visible"))closeNewModal();
    }
  });

  // ── Questions panel (interactive multiple-choice) ──────────────
  var _questions=[];
  var _selectedOptions={};  // questionId -> selected label

  function loadQuestions(){
    authFetch("/api/audit/questions?status=pending").then(function(r){return r.json();}).then(function(data){
      if(!Array.isArray(data)){_questions=[];renderQuestions();return;}
      _questions=data;
      renderQuestions();
    }).catch(function(){});
  }

  function formatCountdown(deadline){
    var ms=new Date(deadline).getTime()-Date.now();
    if(ms<=0)return {text:"EXPIRED",cls:"expired"};
    var mins=Math.floor(ms/60000);
    var hrs=Math.floor(mins/60);
    mins=mins%60;
    if(hrs>0)return {text:hrs+"h "+mins+"m",cls:hrs<1?"urgent":""};
    return {text:mins+"m",cls:mins<10?"urgent":""};
  }

  // Build a lookup from question ID to question object
  var _qById={};

  function renderQuestions(){
    var panel=document.getElementById("questions-panel");
    if(!_questions.length){panel.innerHTML="";return;}

    // Build lookup
    _qById={};
    _questions.forEach(function(q){ _qById[q.id]=q; });

    // Group questions by worktree
    var groups={};
    _questions.forEach(function(q){
      if(!groups[q.worktree_id])groups[q.worktree_id]=[];
      groups[q.worktree_id].push(q);
    });

    var h='<div class="q-panel"><div class="section"><div class="section-header" style="color:#d876e3">Pending Questions <span class="count">('+_questions.length+')</span></div>';

    Object.keys(groups).forEach(function(wtId){
      var qs=groups[wtId];
      h+='<div style="margin-bottom:16px"><div style="font-size:11px;color:#666;margin-bottom:6px">Session <a href="/s/'+esc(wtId)+'" class="link">'+esc(wtId.slice(0,8))+'</a></div>';

      qs.forEach(function(q){
        var cd=formatCountdown(q.deadline);
        var safeId=esc(q.id);
        h+='<div class="q-card pending" data-qid="'+safeId+'">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
          +'<div><span class="q-urgency '+esc(q.urgency)+'">'+esc(q.urgency)+'</span>'
          +'<span class="q-countdown '+cd.cls+'">'+cd.text+'</span></div></div>'
          +'<div class="q-desc">'+esc(q.description)+'</div>'
          +'<div class="q-text">'+esc(q.text)+'</div>'
          +'<div class="q-context">'+esc(q.context)+'</div>';

        // Show body detail (collapsible)
        if(q.body){
          h+='<details style="margin-bottom:8px"><summary style="font-size:11px;color:#666;cursor:pointer">Reasoning & references</summary>'
            +'<div class="q-body-detail">'+esc(q.body)+'</div></details>';
        }

        // Multiple-choice options — use data attributes, no inline handlers
        h+='<div class="q-options">';
        q.options.forEach(function(opt,idx){
          h+='<label class="q-option" data-qid="'+safeId+'" data-idx="'+idx+'">'
            +'<input type="radio" name="q-radio-'+safeId+'" data-qid="'+safeId+'" data-idx="'+idx+'">'
            +'<div><div class="q-option-label">'+esc(opt.label)+'</div>'
            +'<div class="q-option-desc">'+esc(opt.description)+'</div></div></label>';
        });
        // "Other" option
        h+='<label class="q-option" data-qid="'+safeId+'" data-idx="other">'
          +'<input type="radio" name="q-radio-'+safeId+'" data-qid="'+safeId+'" data-idx="other">'
          +'<div><div class="q-option-label">Other</div>'
          +'<div class="q-option-desc">Provide your own answer below</div></div></label>';
        h+='</div>';

        // Freeform text field
        h+='<textarea class="q-freeform" data-qid="'+safeId+'" placeholder="Add details, references, or your own answer..."></textarea>';

        // Submit
        h+='<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:6px">'
          +'<span class="q-answer-ok" data-qid="'+safeId+'" style="display:none"></span>'
          +'<button class="q-answer-btn" data-qid="'+safeId+'">Answer</button>'
          +'</div></div>';
      });

      // Direction field per worktree group
      h+='<div class="q-direction">'
        +'<label>Further direction for this session (freeform \u2014 reference implementation plans, reasoning, etc.)</label>'
        +'<textarea data-wt="'+esc(wtId)+'" class="q-dir-input" placeholder="e.g., Focus on the CRT carry proof next. See Phase 2 of the strategy..."></textarea>'
        +'<button class="q-answer-btn q-dir-btn" data-wt="'+esc(wtId)+'" style="background:#5FA7F1">Save Direction</button>'
        +'</div>';

      h+='</div>';
    });

    h+='</div></div>';
    panel.innerHTML=h;
    bindQuestionEvents();
  }

  function bindQuestionEvents(){
    var panel=document.getElementById("questions-panel");
    if(!panel)return;

    // Option selection via event delegation
    panel.querySelectorAll(".q-option").forEach(function(el){
      el.addEventListener("click",function(){
        var qId=el.getAttribute("data-qid");
        var idx=el.getAttribute("data-idx");
        var q=_qById[qId];
        if(!q)return;
        var label=(idx==="other")?"Other":q.options[parseInt(idx)].label;
        _selectedOptions[qId]=label;
        // Highlight selected
        var container=el.closest(".q-options");
        if(container){
          container.querySelectorAll(".q-option").forEach(function(o){o.classList.remove("selected");});
          el.classList.add("selected");
        }
        // Check the radio
        var radio=el.querySelector("input[type=radio]");
        if(radio)radio.checked=true;
      });
    });

    // Answer button
    panel.querySelectorAll(".q-answer-btn:not(.q-dir-btn)").forEach(function(btn){
      btn.addEventListener("click",function(){
        var qId=btn.getAttribute("data-qid");
        if(!qId)return;
        var selected=_selectedOptions[qId];
        if(!selected){alert("Please select an option");return;}
        var freeEl=panel.querySelector('textarea.q-freeform[data-qid="'+qId+'"]');
        var freeform=freeEl?freeEl.value:"";
        if(selected==="Other"&&!freeform.trim()){alert("Please provide your answer in the text field");return;}

        btn.disabled=true;btn.textContent="Submitting...";

        authFetch("/api/audit/questions/"+encodeURIComponent(qId)+"/answer",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({selected_option:selected,freeform_answer:freeform,answered_by:getIdentity()})
        }).then(function(r){
          if(r.status===401){alert("Authentication required. Please log in again.");btn.disabled=false;btn.textContent="Answer";return Promise.reject(new Error("unauthorized"));}
          return r.json();
        }).then(function(d){
          if(!d)return;
          if(d.ok){
            var statusEl=panel.querySelector('.q-answer-ok[data-qid="'+qId+'"]');
            if(statusEl){
              var msg="Answered";
              if(d.all_resolved)msg+=d.resumed?" \u2014 session resuming automatically":" \u2014 all questions resolved";
              statusEl.textContent=msg;
              statusEl.style.display="block";
            }
            btn.textContent="Done";
            setTimeout(function(){loadQuestions();},2000);
          } else {
            btn.disabled=false;btn.textContent="Answer";
            alert("Error: "+(d.error||d.message||"unknown"));
          }
        }).catch(function(e){
          if(e.message!=="unauthorized"){btn.disabled=false;btn.textContent="Answer";alert("Error: "+e.message);}
        });
      });
    });

    // Direction save button
    panel.querySelectorAll(".q-dir-btn").forEach(function(btn){
      btn.addEventListener("click",function(){
        var wtId=btn.getAttribute("data-wt");
        if(!wtId)return;
        var textarea=panel.querySelector('textarea.q-dir-input[data-wt="'+wtId+'"]');
        if(!textarea)return;
        var text=textarea.value.trim();
        if(!text){textarea.focus();return;}

        btn.disabled=true;btn.textContent="Saving...";

        authFetch("/api/audit/questions/direction",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({worktree_id:wtId,text:text,author:getIdentity()})
        }).then(function(r){
          if(r.status===401){alert("Authentication required.");btn.disabled=false;btn.textContent="Save Direction";return Promise.reject(new Error("unauthorized"));}
          return r.json();
        }).then(function(d){
          if(!d)return;
          if(d.ok){textarea.style.borderColor="#61D668";btn.disabled=false;btn.textContent="Saved";setTimeout(function(){btn.textContent="Save Direction";},2000);}
          else{btn.disabled=false;btn.textContent="Save Direction";alert("Error: "+(d.error||"unknown"));}
        }).catch(function(e){
          if(e.message!=="unauthorized"){btn.disabled=false;btn.textContent="Save Direction";alert("Error: "+e.message);}
        });
      });
    });
  }

  // Update countdowns every second
  setInterval(function(){
    _questions.forEach(function(q){
      if(q.status!=="pending")return;
      var el=document.querySelector('.q-card[data-qid="'+q.id+'"] .q-countdown');
      if(el){var cd=formatCountdown(q.deadline);el.textContent=cd.text;el.className="q-countdown "+cd.cls;}
    });
  },1000);

  // ── Findings summary ──────────────────────────────────────────
  var _findingsExpanded=false;
  function loadFindings(){
    authFetch("/api/audit/findings?state=all").then(function(r){return r.json();}).then(function(data){
      if(!Array.isArray(data)||!data.length){document.getElementById("findings-summary").innerHTML="";return;}
      var openIssues=data.filter(function(i){return i.state==="open";});
      var closedIssues=data.filter(function(i){return i.state!=="open";});
      var areas={};
      data.forEach(function(i){
        (i.labels||[]).forEach(function(l){
          if(l.name.startsWith("area/")){
            areas[l.name]=(areas[l.name]||0)+1;
          }
        });
      });
      var h='<div class="section"><div class="section-header" onclick="toggleFindings()">Findings <span class="count">('+data.length+')</span> <span class="toggle">'+(_findingsExpanded?"\u25BC":"\u25B6")+'</span></div><div class="findings-bar">';
      h+='<div class="finding-stat open"><span class="count">'+openIssues.length+'</span>open</div>';
      h+='<div class="finding-stat closed"><span class="count">'+closedIssues.length+'</span>closed</div>';
      Object.keys(areas).sort().forEach(function(a){
        h+='<div class="finding-stat"><span class="count">'+areas[a]+'</span>'+esc(a)+'</div>';
      });
      h+='</div>';
      if(_findingsExpanded){
        h+='<div class="findings-list">';
        if(openIssues.length){
          h+='<div style="font-size:11px;color:#888;margin:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px">Open</div>';
          openIssues.forEach(function(i){
            var labels=(i.labels||[]).filter(function(l){return l.name!=="audit-finding";}).map(function(l){
              return '<span class="finding-label" style="border-color:#'+esc(l.color||"333")+'">'+esc(l.name)+'</span>';
            }).join("");
            h+='<a href="'+esc(i.html_url)+'" target="_blank" class="finding-row open">'
              +'<span class="finding-number">#'+i.number+'</span>'
              +'<span class="finding-title">'+esc(i.title)+'</span>'
              +labels
              +'</a>';
          });
        }
        if(closedIssues.length){
          h+='<div style="font-size:11px;color:#888;margin:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px">Closed</div>';
          closedIssues.forEach(function(i){
            h+='<a href="'+esc(i.html_url)+'" target="_blank" class="finding-row closed">'
              +'<span class="finding-number">#'+i.number+'</span>'
              +'<span class="finding-title">'+esc(i.title)+'</span>'
              +'</a>';
          });
        }
        h+='</div>';
      }
      h+='</div>';
      document.getElementById("findings-summary").innerHTML=h;
    }).catch(function(){});
  }
  window.toggleFindings=function(){_findingsExpanded=!_findingsExpanded;loadFindings();};

  // ── Coverage panel ───────────────────────────────────────────
  var _openCovMods={};  // modName -> true if expanded
  function loadCoverage(){
    authFetch("/api/audit/coverage").then(function(r){return r.json();}).then(function(data){
      var panel=document.getElementById("coverage-panel");
      if(!data){panel.innerHTML="";return;}

      var mods=data.modules||{};
      var modNames=Object.keys(mods).sort();
      var totalIssues=0;
      var totalReviewed=data.total_reviewed||0;
      var totalRepo=data.total_repo_files||0;
      var pct=totalRepo?Math.round(totalReviewed/totalRepo*100):0;
      modNames.forEach(function(m){totalIssues+=mods[m].issues_found||0;});

      // Only show modules that have files (either in repo or reviewed)
      var activeModNames=modNames.filter(function(m){return mods[m].total_files>0||mods[m].files_reviewed>0;});

      var h='<div class="section"><div class="section-header">Audit Coverage <span class="count">'+totalReviewed+'/'+totalRepo+' files ('+pct+'%)</span></div>';

      // Overall progress bar
      h+='<div style="margin-bottom:14px">';
      h+='<div style="background:#1a1a1a;border:1px solid #333;border-radius:4px;height:22px;overflow:hidden;position:relative">';
      h+='<div style="background:linear-gradient(90deg,#7aa2f7,#d876e3);height:100%;width:'+pct+'%;min-width:1px;transition:width 0.3s"></div>';
      h+='<span style="position:absolute;top:3px;left:8px;font-size:11px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.8)">'+totalReviewed+' / '+totalRepo+' files reviewed ('+pct+'%)</span>';
      h+='</div></div>';

      // Stats bar
      h+='<div class="cov-bar">';
      h+='<div class="cov-stat"><span class="count" style="color:#7aa2f7">'+totalReviewed+'</span>reviewed</div>';
      h+='<div class="cov-stat"><span class="count">'+totalRepo+'</span>total files</div>';
      h+='<div class="cov-stat"><span class="count" style="color:#E94560">'+totalIssues+'</span>issues found</div>';
      h+='<div class="cov-stat"><span class="count">'+data.total_reviews+'</span>total reviews</div>';
      h+='</div>';

      // Module cards — sort by coverage percentage (reviewed modules first, then by size)
      activeModNames.sort(function(a,b){
        var aR=mods[a].files_reviewed,bR=mods[b].files_reviewed;
        if(aR>0&&bR===0)return -1;
        if(bR>0&&aR===0)return 1;
        if(aR>0&&bR>0)return (bR/mods[b].total_files)-(aR/mods[a].total_files);
        return mods[b].total_files-mods[a].total_files;
      });

      h+='<div class="cov-modules">';
      activeModNames.forEach(function(modName){
        var m=mods[modName];
        var modPct=m.total_files?Math.round(m.files_reviewed/m.total_files*100):0;
        var depthCounts={deep:0,"line-by-line":0,cursory:0};
        (m.files||[]).forEach(function(f){depthCounts[f.review_depth]=(depthCounts[f.review_depth]||0)+1;});

        var borderColor=m.files_reviewed===0?"#333":modPct>=80?"#61D668":modPct>=30?"#7aa2f7":"#FAD979";

        h+='<div class="cov-mod" style="border-color:'+borderColor+'" data-mod="'+esc(modName)+'" onclick="toggleCovFiles(this,event)">';
        h+='<div style="display:flex;justify-content:space-between;align-items:center">';
        h+='<div class="cov-mod-name">'+esc(modName)+'</div>';
        h+='<span style="font-size:11px;color:'+(modPct>0?borderColor:"#555")+'">'+m.files_reviewed+'/'+m.total_files+' ('+modPct+'%)</span>';
        h+='</div>';

        // Mini progress bar
        h+='<div style="background:#0d0d0d;border-radius:2px;height:4px;margin:6px 0;overflow:hidden">';
        if(m.files_reviewed>0){
          h+='<div style="height:100%;width:'+modPct+'%;min-width:2px;background:'+borderColor+';border-radius:2px"></div>';
        }
        h+='</div>';

        h+='<div class="cov-mod-meta">';
        if(m.issues_found)h+='<span class="issues">'+m.issues_found+' issues</span>';
        h+='</div>';
        if(m.files_reviewed>0){
          h+='<div style="margin-top:4px">';
          if(depthCounts.deep)h+='<span class="cov-depth deep">'+depthCounts.deep+' deep</span>';
          if(depthCounts["line-by-line"])h+='<span class="cov-depth line-by-line">'+depthCounts["line-by-line"]+' line-by-line</span>';
          if(depthCounts.cursory)h+='<span class="cov-depth cursory">'+depthCounts.cursory+' cursory</span>';
          h+='</div>';
        }

        // Hidden file list (restored from _openCovMods)
        if(m.files&&m.files.length){
          h+='<div class="cov-files'+(_openCovMods[modName]?" open":"")+'">';
          m.files.forEach(function(f){
            h+='<div class="cov-file">';
            h+='<span class="cov-depth '+esc(f.review_depth)+'">'+esc(f.review_depth)+'</span>';
            h+='<span class="cov-file-path" title="'+esc(f.file_path)+'">'+esc(f.file_path.replace(/^barretenberg\\/cpp\\/src\\/barretenberg\\//,""))+'</span>';
            if(f.issues_found)h+='<span style="color:#E94560;font-size:10px">'+f.issues_found+' issue'+(f.issues_found>1?"s":"")+'</span>';
            h+='</div>';
            if(f.notes)h+='<div class="cov-file-notes">'+esc(f.notes)+'</div>';
          });
          h+='</div>';
        }

        h+='</div>';
      });
      h+='</div>';

      // Session summaries
      if(data.summaries&&data.summaries.length){
        h+='<div class="cov-summaries"><div style="font-size:11px;color:#666;margin-bottom:6px">Session Summaries</div>';
        data.summaries.forEach(function(s){
          h+='<div class="cov-summary">';
          h+='<div class="cov-summary-text">'+esc(s.summary||"")+'</div>';
          h+='<div class="cov-summary-meta">';
          if(s.gist_url)h+='<a href="'+esc(s.gist_url)+'" target="_blank" class="link">gist</a>';
          h+='<span>'+s.files_reviewed+' files</span>';
          h+='<span>'+s.issues_filed+' issues</span>';
          if(s.ts)h+='<span>'+timeAgo(s.ts)+'</span>';
          h+='</div></div>';
        });
        h+='</div>';
      }

      h+='</div>';
      panel.innerHTML=h;
    }).catch(function(){});
  }

  window.toggleCovFiles=function(el,e){
    // Don't toggle when clicking inside the expanded file list
    if(e&&e.target.closest&&e.target.closest(".cov-files"))return;
    var files=el.querySelector(".cov-files");
    if(!files)return;
    files.classList.toggle("open");
    var mod=el.getAttribute("data-mod");
    if(mod){if(files.classList.contains("open"))_openCovMods[mod]=true;else delete _openCovMods[mod];}
  };

  setInterval(function(){
    if(document.visibilityState!=="visible")return;
    if(!loadCreds())return;
    if(document.getElementById("new-modal").classList.contains("visible"))return;
    loadDashboard();
    loadFindings();
    loadCoverage();
  },10000);

  // Questions refresh faster (5s) for interactive experience
  setInterval(function(){
    if(document.visibilityState!=="visible")return;
    if(!loadCreds())return;
    loadQuestions();
  },5000);
})();
</script>
</body></html>`;
}

// ── Personal Dashboard ─────────────────────────────────────────

const PERSONAL_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#ccc;font-family:'SF Mono',Monaco,'Cascadia Code',monospace;font-size:13px;line-height:1.5;height:100vh;display:flex;flex-direction:column}
a{color:#7aa2f7;text-decoration:none}a:hover{text-decoration:underline}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

/* Header */
.header{padding:10px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;flex-shrink:0;background:#0d0d0d;flex-wrap:wrap}
.header-title{font-weight:bold;color:#d876e3;font-size:15px}
.header-spacer{flex:1}
.header-item{display:flex;align-items:center;gap:6px;font-size:12px}
.header-link{color:#666;font-size:12px}
.header-link:hover{color:#ccc}

/* Search */
.search-input{background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:5px 10px;font-family:inherit;font-size:12px;width:200px}
.search-input:focus{outline:none;border-color:#d876e3}

/* View toggle */
.view-toggle{display:flex;border:1px solid #333;border-radius:4px;overflow:hidden}
.view-toggle button{background:#111;color:#666;border:none;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer}
.view-toggle button.active{background:#222;color:#d876e3}
.view-toggle button:hover:not(.active){color:#ccc}

/* Buttons */
.btn{background:#151515;color:#ccc;border:1px solid #333;border-radius:4px;padding:5px 14px;font-family:inherit;font-size:12px;cursor:pointer;transition:all 0.15s}
.btn:hover{background:#222;color:#fff}
.btn:disabled{color:#444;border-color:#222;cursor:default;background:#0d0d0d}
.btn-green{border-color:#61D668;color:#61D668}.btn-green:hover{background:#0d1f0d}
.btn-purple{border-color:#d876e3;color:#d876e3}.btn-purple:hover{background:#1f0d1f}
.btn-red{border-color:#E94560;color:#E94560}.btn-red:hover{background:#1f0d0d}
.btn-sm{padding:3px 8px;font-size:11px}

/* Main content */
.main{flex:1;overflow-y:auto;padding:16px}

/* Tag chips */
.tag-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.tag-chip{font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid #333;color:#aaa;cursor:pointer;transition:all 0.15s;user-select:none}
.tag-chip:hover{border-color:#666;color:#ccc}
.tag-chip.active{border-color:#d876e3;color:#d876e3;background:rgba(216,118,227,0.1)}

/* Channel groups */
.channel-group{margin-bottom:24px}
.channel-header{font-size:13px;font-weight:bold;color:#FAD979;padding:8px 0 6px;border-bottom:1px solid #1a1a1a;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.channel-header .count{color:#666;font-weight:normal;font-size:11px}
.thread-group{margin-left:12px;margin-bottom:14px;padding-left:12px;border-left:2px solid #1a1a1a}
.thread-header{font-size:11px;color:#666;margin-bottom:8px;cursor:pointer}
.thread-header:hover{color:#999}

/* Cards */
.ws-card{background:#111;border:1px solid #222;border-radius:6px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;position:relative}
.ws-card:hover{border-color:#444}
.ws-card.running{border-left:3px solid #61D668}
.ws-card.interactive{border-left:3px solid #FAD979}
.ws-card.error{border-left:3px solid #E94560}
.ws-card-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px}
.ws-card-name{font-size:13px;font-weight:bold;color:#ddd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-card-status{display:flex;align-items:center;gap:4px;font-size:11px;flex-shrink:0}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.status-dot.running{background:#61D668;animation:pulse 2s infinite}
.status-dot.interactive{background:#FAD979;animation:pulse 2s infinite}
.status-dot.completed{background:#61D668}
.status-dot.error{background:#E94560}
.status-dot.cancelled,.status-dot.interrupted,.status-dot.unknown{background:#666}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.ws-card-meta{display:flex;gap:10px;font-size:11px;color:#666;flex-wrap:wrap;margin-bottom:4px}
.ws-card-response{font-size:11px;color:#888;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.ws-card-artifacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.artifact-link{font-size:11px;color:#7aa2f7;background:#0d1a2e;padding:2px 8px;border-radius:3px;border:1px solid #1a2a44}
.artifact-link:hover{border-color:#7aa2f7}
.ws-card-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.ws-tag{font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid #333;color:#aaa;background:#151515}
.ws-card-actions{margin-top:8px;display:flex;gap:6px}

/* Flat view */
.flat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:10px}

/* Stats bar */
.stats-bar{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;font-size:12px;color:#666}
.stat{background:#111;border:1px solid #222;border-radius:4px;padding:6px 12px}
.stat .num{color:#d876e3;font-weight:bold;font-size:16px;margin-right:4px}

/* Empty state */
.empty{text-align:center;color:#444;padding:40px 20px;font-size:13px}

/* New session modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100;display:none;align-items:center;justify-content:center}
.modal-overlay.visible{display:flex}
.modal{background:#111;border:1px solid #333;border-radius:8px;padding:24px;width:420px;max-width:90vw;display:flex;flex-direction:column;gap:14px}
.modal-title{color:#d876e3;font-weight:bold;font-size:14px}
.form-row{display:flex;flex-direction:column;gap:4px}
.form-label{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666}
.form-input{background:#0a0a0a;border:1px solid #333;border-radius:4px;padding:8px 12px;color:#ccc;font-family:inherit;font-size:13px;resize:none}
.form-input:focus{outline:none;border-color:#d876e3}
.form-input.textarea{height:100px}
.form-select{background:#0a0a0a;border:1px solid #333;border-radius:4px;padding:8px 12px;color:#ccc;font-family:inherit;font-size:13px}
.form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.form-error{color:#E94560;font-size:11px;display:none}

@media(max-width:480px){.flat-grid{grid-template-columns:1fr}.header{gap:8px}.search-input{width:140px}}
`;

export function personalDashboardHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Sessions - ClaudeBox</title>
<style>${PERSONAL_STYLES}</style>
</head>
<body>

<!-- Auth overlay -->
<div id="auth-overlay" class="modal-overlay visible">
  <form id="auth-form" class="modal" autocomplete="on" style="width:280px">
    <div class="modal-title" style="text-align:center">ClaudeBox Login</div>
    <input id="auth-user" name="username" type="text" autocomplete="username" placeholder="Username" class="form-input" required>
    <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" class="form-input" required>
    <button type="submit" class="btn btn-purple" style="width:100%;padding:8px">Login</button>
    <div id="auth-error" class="form-error"></div>
  </form>
</div>

<!-- Header -->
<div class="header" id="app-header" style="display:none">
  <span class="header-title">MY SESSIONS</span>
  <a href="/dashboard" class="header-link">← Dashboard</a>
  <span class="header-spacer"></span>
  <input id="search-input" class="search-input" type="text" placeholder="Search sessions...">
  <div class="view-toggle">
    <button id="view-grouped" class="active">By Channel</button>
    <button id="view-flat">All</button>
  </div>
  <div class="header-item">
    <span style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">as</span>
    <select id="identity-select" style="background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer"><option value="">All</option></select>
  </div>
  <button id="new-btn" class="btn btn-green btn-sm">+ New</button>
</div>

<!-- Main content -->
<div class="main" id="app-main" style="display:none">
  <div id="stats-bar" class="stats-bar"></div>
  <div id="tag-bar" class="tag-bar"></div>
  <div id="content"></div>
</div>

<!-- New session modal -->
<div id="new-modal" class="modal-overlay">
  <form id="new-form" class="modal">
    <div class="modal-title">New Session</div>
    <div class="form-row">
      <label class="form-label">What should ClaudeBox work on?</label>
      <textarea id="new-prompt" class="form-input textarea" placeholder="Describe the task..." required></textarea>
    </div>
    <div class="form-row">
      <label class="form-label">Branch</label>
      <select id="new-branch" class="form-select"><option value="next">next</option></select>
    </div>
    <div id="new-error" class="form-error"></div>
    <div class="form-actions">
      <button type="button" class="btn" id="new-cancel-btn">Cancel</button>
      <button type="submit" class="btn btn-green" id="new-submit">Start Session</button>
    </div>
  </form>
</div>

<script>
(function(){
  // ── Auth ────────────────────────────────────────────
  var _creds=null;
  function loadCreds(){
    if(_creds)return _creds;
    try{var s=sessionStorage.getItem("cb_auth");if(s){_creds=JSON.parse(s);return _creds;}}catch{}
    return null;
  }
  function saveCreds(u,p){
    _creds={user:u,pass:p,basic:"Basic "+btoa(u+":"+p)};
    try{sessionStorage.setItem("cb_auth",JSON.stringify(_creds));}catch{}
    return _creds;
  }
  function authFetch(url,opts){
    var c=loadCreds();if(!c)return Promise.reject(new Error("Not authenticated"));
    opts=opts||{};opts.headers=Object.assign({"Authorization":c.basic},opts.headers||{});
    return fetch(url,opts);
  }
  function showApp(){
    document.getElementById("auth-overlay").classList.remove("visible");
    document.getElementById("app-header").style.display="flex";
    document.getElementById("app-main").style.display="block";
    loadBranches();
    loadSessions();
  }
  var cached=loadCreds();
  if(cached){
    fetch("/auth-check",{method:"POST",headers:{"Authorization":cached.basic}})
      .then(function(r){if(r.ok)showApp();else{_creds=null;sessionStorage.removeItem("cb_auth");document.getElementById("auth-user").focus();}})
      .catch(function(){showApp();});
  } else {
    document.getElementById("auth-user").focus();
  }
  document.getElementById("auth-form").addEventListener("submit",function(e){
    e.preventDefault();
    var u=document.getElementById("auth-user").value, p=document.getElementById("auth-pass").value;
    fetch("/auth-check",{method:"POST",headers:{"Authorization":"Basic "+btoa(u+":"+p)}})
      .then(function(r){
        if(r.status===401){var el=document.getElementById("auth-error");el.textContent="Invalid credentials";el.style.display="block";return;}
        saveCreds(u,p);showApp();
      }).catch(function(){var el=document.getElementById("auth-error");el.textContent="Connection error";el.style.display="block";});
  });

  function loadBranches(){
    authFetch("/api/branches").then(function(r){return r.json();}).then(function(d){
      var sel=document.getElementById("new-branch");
      sel.innerHTML="";
      (d.branches||["next"]).forEach(function(b){
        var o=document.createElement("option");o.value=b;o.textContent=b;
        sel.appendChild(o);
      });
    }).catch(function(){});
  }

  // ── Identity ───────────────────────────────────────
  var _identitySelect=document.getElementById("identity-select");
  var _selectedUser=localStorage.getItem("cb_me_identity")||"";
  _identitySelect.addEventListener("change",function(){
    _selectedUser=_identitySelect.value;
    localStorage.setItem("cb_me_identity",_selectedUser);
    filterAndRender();
  });

  // ── State ──────────────────────────────────────────
  var _rawData=null; // raw API response
  var _data=null; // filtered {groups, flat}
  var _view="grouped"; // "grouped" | "flat"
  var _searchTerm="";
  var _activeTags=new Set();
  var _allTags=new Set();

  // ── Helpers ────────────────────────────────────────
  function timeAgo(iso){
    if(!iso)return "—";
    var ms=Date.now()-new Date(iso).getTime();
    if(ms<60000)return "just now";
    if(ms<3600000)return Math.floor(ms/60000)+"m ago";
    if(ms<86400000)return Math.floor(ms/3600000)+"h ago";
    return Math.floor(ms/86400000)+"d ago";
  }
  function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function linkify(s){return s.replace(/(https?:\\/\\/[^\\s&<"']+)/g,function(m){var u=m.replace(/[.,;:!?)}\]]+$/,'');var rest=m.slice(u.length);for(var i=0;i<rest.length;i++){if(rest[i]===')'&&u.split('(').length>u.split(')').length){u+=rest[i]}else break}return'<a href="'+u+'" target="_blank" class="artifact-link">'+u+'</a>'+m.slice(u.length)});}

  // ── Load sessions ─────────────────────────────────
  function loadSessions(){
    authFetch("/api/me/sessions")
      .then(function(r){return r.json();})
      .then(function(d){
        _rawData=d;
        populateIdentityPicker();
        filterAndRender();
      }).catch(function(e){
        document.getElementById("content").innerHTML='<div class="empty">Failed to load sessions: '+esc(e.message)+'</div>';
      });
  }

  function populateIdentityPicker(){
    if(!_rawData||!_rawData.flat)return;
    var users=new Set();
    _rawData.flat.forEach(function(w){if(w.user)users.add(w.user);});
    var sorted=Array.from(users).sort();
    var prev=_identitySelect.value;
    _identitySelect.innerHTML='<option value="">All</option>';
    sorted.forEach(function(u){
      var o=document.createElement("option");o.value=u;o.textContent=u;
      if(u===_selectedUser)o.selected=true;
      _identitySelect.appendChild(o);
    });
  }

  function filterAndRender(){
    if(!_rawData)return;
    // Client-side filter by selected user
    if(_selectedUser){
      var filtered=_rawData.flat.filter(function(w){return w.user===_selectedUser;});
      _data={flat:filtered,groups:filterGroups(_rawData.groups,_selectedUser)};
    } else {
      _data=_rawData;
    }
    collectTags();
    renderStats();
    renderTagBar();
    render();
  }

  function filterGroups(groups,user){
    var out=[];
    (groups||[]).forEach(function(g){
      var threads=[];
      (g.threads||[]).forEach(function(t){
        var ws=(t.workspaces||[]).filter(function(w){return w.user===user;});
        if(ws.length)threads.push({threadTs:t.threadTs,firstPrompt:t.firstPrompt,workspaces:ws});
      });
      if(threads.length)out.push({channel:g.channel,channelId:g.channelId,threads:threads});
    });
    return out;
  }

  function collectTags(){
    _allTags=new Set();
    if(!_data||!_data.flat)return;
    _data.flat.forEach(function(w){
      (w.tags||[]).forEach(function(t){_allTags.add(t);});
    });
  }

  function matchesFilter(w){
    // Search filter
    if(_searchTerm){
      var s=_searchTerm.toLowerCase();
      var haystack=((w.prompt||"")+" "+(w.name||"")+" "+(w.channelName||"")+" "+(w.tags||[]).join(" ")+" "+(w.latestResponse||"")).toLowerCase();
      if(haystack.indexOf(s)===-1)return false;
    }
    // Tag filter
    if(_activeTags.size>0){
      var wTags=w.tags||[];
      var match=false;
      _activeTags.forEach(function(t){if(wTags.indexOf(t)!==-1)match=true;});
      if(!match)return false;
    }
    return true;
  }

  // ── Render ────────────────────────────────────────
  function renderStats(){
    if(!_data||!_data.flat)return;
    var total=_data.flat.length;
    var running=_data.flat.filter(function(w){return w.status==="running"||w.status==="interactive";}).length;
    var completed=_data.flat.filter(function(w){return w.status==="completed";}).length;
    var errors=_data.flat.filter(function(w){return w.status==="error";}).length;
    var artifacts=0;
    _data.flat.forEach(function(w){artifacts+=(w.artifacts||[]).length;});
    document.getElementById("stats-bar").innerHTML=
      '<div class="stat"><span class="num">'+total+'</span>sessions</div>'
      +'<div class="stat"><span class="num" style="color:#61D668">'+running+'</span>running</div>'
      +'<div class="stat"><span class="num" style="color:#61D668">'+completed+'</span>completed</div>'
      +(errors?'<div class="stat"><span class="num" style="color:#E94560">'+errors+'</span>errors</div>':'')
      +'<div class="stat"><span class="num" style="color:#7aa2f7">'+artifacts+'</span>artifacts</div>';
  }

  function renderTagBar(){
    if(_allTags.size===0){document.getElementById("tag-bar").innerHTML="";return;}
    var html="";
    var sorted=Array.from(_allTags).sort();
    sorted.forEach(function(t){
      var active=_activeTags.has(t)?" active":"";
      html+='<span class="tag-chip'+active+'" data-tag="'+esc(t)+'">'+esc(t)+'</span>';
    });
    document.getElementById("tag-bar").innerHTML=html;
    // Bind click handlers
    document.querySelectorAll(".tag-chip").forEach(function(el){
      el.addEventListener("click",function(){
        var tag=el.getAttribute("data-tag");
        if(_activeTags.has(tag))_activeTags.delete(tag);else _activeTags.add(tag);
        renderTagBar();
        render();
      });
    });
  }

  function render(){
    if(!_data){document.getElementById("content").innerHTML='<div class="empty">Loading...</div>';return;}
    if(_view==="grouped")renderGrouped();else renderFlat();
  }

  function renderGrouped(){
    if(!_data.groups||!_data.groups.length){
      document.getElementById("content").innerHTML='<div class="empty">No sessions found for this user.</div>';
      return;
    }
    var html="";
    _data.groups.forEach(function(g){
      // Filter threads and cards
      var visibleThreads=[];
      g.threads.forEach(function(t){
        var visibleWs=t.workspaces.filter(matchesFilter);
        if(visibleWs.length)visibleThreads.push({threadTs:t.threadTs,firstPrompt:t.firstPrompt,workspaces:visibleWs});
      });
      if(!visibleThreads.length)return;

      var totalInChannel=0;
      visibleThreads.forEach(function(t){totalInChannel+=t.workspaces.length;});
      html+='<div class="channel-group">';
      html+='<div class="channel-header">#'+esc(g.channel)+' <span class="count">('+totalInChannel+' session'+(totalInChannel!==1?"s":"")+')</span></div>';

      visibleThreads.forEach(function(t){
        if(visibleThreads.length>1||t.workspaces.length>1){
          var threadLabel=t.firstPrompt?esc(t.firstPrompt.length>80?t.firstPrompt.slice(0,80)+"…":t.firstPrompt):"Thread";
          html+='<div class="thread-group">';
          html+='<div class="thread-header">'+threadLabel+'</div>';
          t.workspaces.forEach(function(w){html+=renderCard(w);});
          html+='</div>';
        } else {
          t.workspaces.forEach(function(w){html+=renderCard(w);});
        }
      });

      html+='</div>';
    });
    if(!html)html='<div class="empty">No matching sessions.</div>';
    document.getElementById("content").innerHTML=html;
    bindCardActions();
  }

  function renderFlat(){
    if(!_data.flat||!_data.flat.length){
      document.getElementById("content").innerHTML='<div class="empty">No sessions found for this user.</div>';
      return;
    }
    var visible=_data.flat.filter(matchesFilter);
    if(!visible.length){
      document.getElementById("content").innerHTML='<div class="empty">No matching sessions.</div>';
      return;
    }
    var html='<div class="flat-grid">'+visible.map(renderCard).join("")+'</div>';
    document.getElementById("content").innerHTML=html;
    bindCardActions();
  }

  function renderCard(w){
    var cls="ws-card";
    if(w.status==="running"||w.status==="interactive")cls+=" "+w.status;
    if(w.status==="error")cls+=" error";
    var displayName=w.name||w.prompt||"Unnamed";
    if(displayName.length>80)displayName=displayName.slice(0,80)+"…";
    var exitStr=w.exitCode!=null?" ("+w.exitCode+")":"";

    var html='<div class="'+cls+'" data-id="'+esc(w.worktreeId)+'">';
    html+='<div class="ws-card-top">';
    html+='<div class="ws-card-name">'+esc(displayName)+'</div>';
    html+='<div class="ws-card-status"><span class="status-dot '+w.status+'"></span><span>'+w.status+exitStr+'</span></div>';
    html+='</div>';

    html+='<div class="ws-card-meta">';
    if(w.channelName)html+='<span>#'+esc(w.channelName)+'</span>';
    html+='<span>'+w.runCount+' run'+(w.runCount!==1?"s":"")+'</span>';
    html+='<span>'+timeAgo(w.started)+'</span>';
    html+='</div>';

    if(w.latestResponse){
      html+='<div class="ws-card-response">'+esc(w.latestResponse)+'</div>';
    }

    if(w.artifacts&&w.artifacts.length){
      html+='<div class="ws-card-artifacts">';
      w.artifacts.forEach(function(a){
        html+='<a href="'+esc(a.url)+'" target="_blank" class="artifact-link" onclick="event.stopPropagation()">'+esc(a.text)+'</a>';
      });
      html+='</div>';
    }

    if(w.tags&&w.tags.length&&!(w.tags.length===1&&w.tags[0]==="untagged")){
      html+='<div class="ws-card-tags">';
      w.tags.forEach(function(t){html+='<span class="ws-tag">'+esc(t)+'</span>';});
      html+='</div>';
    }

    if(w.status==="running"||w.status==="interactive"){
      html+='<div class="ws-card-actions"><button class="btn btn-red btn-sm cancel-btn" data-id="'+esc(w.worktreeId)+'">Cancel</button></div>';
    } else if(!w.tags||!w.tags.length||w.tags.includes("untagged")){
      html+='<div class="ws-card-actions"><button class="btn btn-purple btn-sm tag-btn" data-id="'+esc(w.worktreeId)+'">Auto-tag</button></div>';
    }

    html+='</div>';
    return html;
  }

  function bindCardActions(){
    document.querySelectorAll(".ws-card").forEach(function(el){
      el.addEventListener("click",function(e){
        if(e.target.closest(".cancel-btn")||e.target.closest(".tag-btn")||e.target.closest("a"))return;
        location.href="/s/"+el.getAttribute("data-id");
      });
    });
    document.querySelectorAll(".cancel-btn").forEach(function(el){
      el.addEventListener("click",function(e){
        e.stopPropagation();
        var id=el.getAttribute("data-id");
        authFetch("/s/"+id+"/cancel",{method:"POST"})
          .then(function(){loadSessions();})
          .catch(function(err){alert("Cancel failed: "+err.message);});
      });
    });
    document.querySelectorAll(".tag-btn").forEach(function(el){
      el.addEventListener("click",function(e){
        e.stopPropagation();
        var id=el.getAttribute("data-id");
        el.disabled=true;el.textContent="Tagging...";
        authFetch("/api/me/tag",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({worktree_id:id})})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.tags){loadSessions();}
            else{el.disabled=false;el.textContent="Auto-tag";}
          }).catch(function(){el.disabled=false;el.textContent="Auto-tag";});
      });
    });
  }

  // ── View toggle ───────────────────────────────────
  document.getElementById("view-grouped").addEventListener("click",function(){
    _view="grouped";
    document.getElementById("view-grouped").classList.add("active");
    document.getElementById("view-flat").classList.remove("active");
    render();
  });
  document.getElementById("view-flat").addEventListener("click",function(){
    _view="flat";
    document.getElementById("view-flat").classList.add("active");
    document.getElementById("view-grouped").classList.remove("active");
    render();
  });

  // ── Search ────────────────────────────────────────
  var searchInput=document.getElementById("search-input");
  var searchTimer=null;
  searchInput.addEventListener("input",function(){
    clearTimeout(searchTimer);
    searchTimer=setTimeout(function(){
      _searchTerm=searchInput.value.trim();
      render();
    },200);
  });

  // ── New session modal ─────────────────────────────
  document.getElementById("new-btn").addEventListener("click",function(){
    document.getElementById("new-modal").classList.add("visible");
    document.getElementById("new-prompt").focus();
  });
  document.getElementById("new-cancel-btn").addEventListener("click",function(){
    document.getElementById("new-modal").classList.remove("visible");
    document.getElementById("new-error").style.display="none";
  });
  document.getElementById("new-form").addEventListener("submit",function(e){
    e.preventDefault();
    var prompt=document.getElementById("new-prompt").value.trim();
    var branch=document.getElementById("new-branch").value;
    if(!prompt)return;
    var btn=document.getElementById("new-submit");
    btn.disabled=true;btn.textContent="Starting...";
    authFetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt:prompt,base_branch:branch})})
      .then(function(r){return r.json();}).then(function(d){
        if(d.ok&&d.worktree_id){
          document.getElementById("new-modal").classList.remove("visible");
          location.href="/s/"+d.worktree_id;
        } else {
          var err=document.getElementById("new-error");
          err.textContent=d.message||d.error||"Failed to start session";
          err.style.display="block";
          btn.disabled=false;btn.textContent="Start Session";
        }
      }).catch(function(err){
        var el=document.getElementById("new-error");
        el.textContent="Connection error: "+err.message;el.style.display="block";
        btn.disabled=false;btn.textContent="Start Session";
      });
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      var nm=document.getElementById("new-modal");
      if(nm.classList.contains("visible")){nm.classList.remove("visible");document.getElementById("new-error").style.display="none";}
    }
  });

  // ── Auto-refresh ──────────────────────────────────
  setInterval(function(){
    if(document.visibilityState!=="visible")return;
    if(!loadCreds())return;
    if(document.getElementById("new-modal").classList.contains("visible"))return;
    loadSessions();
  },10000);
})();
</script>
</body></html>`;
}
