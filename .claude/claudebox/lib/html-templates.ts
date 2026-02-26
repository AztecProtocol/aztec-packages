import type { SessionMeta } from "./types.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  type: string;  // "status", "response", "artifact"
  text: string;
}

export interface WorkspacePageData {
  hash: string;            // current session log_id
  session: SessionMeta;    // current session
  sessions: SessionMeta[]; // all sessions for this worktree (newest first)
  worktreeAlive: boolean;
  activity: ActivityEntry[];  // newest first
}

function statusSpan(s: string): string {
  return `<span style="color:${statusColor(s)}">${s}</span>`;
}

export function workspacePageHTML(data: WorkspacePageData): string {
  const { hash, session, sessions, worktreeAlive, activity } = data;
  const worktreeId = session.worktree_id || "";
  const status = session.status || "unknown";
  const user = session.user || "unknown";
  const prompt = esc(session.prompt || "");
  const logUrl = session.log_url || "";
  const baseBranch = session.base_branch || "next";
  const canJoin = status !== "running";
  const canCancel = status === "running" || status === "interactive";
  const isMultiSession = sessions.length > 1;
  const shortId = worktreeId ? worktreeId.slice(0, 8) : hash.slice(0, 8);

  // Session history rows
  const sessionRows = sessions.map(s => {
    const id = s._log_id || "";
    const isCurrent = id === hash;
    const exitStr = s.exit_code != null ? ` exit=${s.exit_code}` : "";
    const logLink = s.log_url ? `<a href="${s.log_url}" target="_blank" class="link">log</a>` : "";
    const cls = isCurrent ? "session-row current" : "session-row";
    return `<div class="${cls}"><a href="/s/${id}" class="link">${id.slice(0, 8)}</a> <span class="status-${s.status || "unknown"}">${s.status || "?"}${exitStr}</span> <span class="dim">${s.started ? timeAgo(s.started) : "\u2014"}</span> ${logLink}</div>`;
  }).join("\n");

  // Activity as chat bubbles (with data-msg hash for deep-linking)
  const chatBubbles = activity.slice(0, 50).map(a => {
    const text = esc(a.text.length > 500 ? a.text.slice(0, 500) + "\u2026" : a.text);
    const linked = text.replace(/(https?:\/\/[^\s&<]+)/g, '<a href="$1" target="_blank" class="link">$1</a>');
    const timeStr = a.ts ? timeAgo(a.ts) : "";
    const msgHash = Buffer.from(a.text.slice(0, 50)).toString("base64url").slice(0, 12);
    if (a.type === "response") {
      return `<div class="chat-msg bot" data-msg="${msgHash}"><div class="chat-avatar">CB</div><div class="chat-bubble bot-bubble"><div class="chat-text">${linked}</div><div class="chat-time">${timeStr}</div></div></div>`;
    }
    if (a.type === "artifact") {
      return `<div class="chat-msg bot" data-msg="${msgHash}"><div class="chat-avatar">CB</div><div class="chat-bubble artifact-bubble"><div class="chat-text">${linked}</div><div class="chat-time">${timeStr}</div></div></div>`;
    }
    // status
    return `<div class="chat-status" data-msg="${msgHash}"><span class="dim">${timeStr}</span> ${linked}</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox \u2014 ${shortId}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#ccc;font-family:'SF Mono',Monaco,'Cascadia Code',monospace;font-size:13px;line-height:1.5;height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
.link{color:#5FA7F1}
.dim{color:#666}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

/* Header bar */
.header{padding:10px 16px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;flex-shrink:0;background:#0d0d0d}
.header-title{font-weight:bold;color:#5FA7F1;font-size:14px}
.header-id{color:#FAD979;font-size:13px}
.header-status{font-size:12px;padding:2px 8px;border-radius:3px;font-weight:bold}
.header-meta{margin-left:auto;display:flex;gap:16px;font-size:12px;color:#666}
.header-meta span{display:flex;align-items:center;gap:4px}

/* Status colors */
.status-running,.header-status.running{color:#61D668;background:rgba(97,214,104,0.1);border:1px solid rgba(97,214,104,0.2)}
.status-interactive,.header-status.interactive{color:#FAD979;background:rgba(250,217,121,0.1);border:1px solid rgba(250,217,121,0.2)}
.status-completed,.header-status.completed{color:#61D668;background:rgba(97,214,104,0.1);border:1px solid rgba(97,214,104,0.2)}
.status-error,.header-status.error{color:#E94560;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.2)}
.status-cancelled,.status-interrupted,.status-unknown,.header-status.cancelled,.header-status.interrupted,.header-status.unknown{color:#888;background:rgba(136,136,136,0.1);border:1px solid rgba(136,136,136,0.2)}

/* Layout: sidebar + main */
.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:320px;border-right:1px solid #1a1a1a;display:flex;flex-direction:column;flex-shrink:0;background:#0d0d0d}
.sidebar-section{padding:10px 12px;border-bottom:1px solid #1a1a1a}
.sidebar-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;margin-bottom:6px}

/* Session list */
.session-row{padding:4px 8px;border-radius:3px;font-size:12px;display:flex;gap:8px;align-items:center}
.session-row:hover{background:#151515}
.session-row.current{background:#111;border-left:2px solid #5FA7F1}

/* Chat area */
.chat-area{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.chat-msg{display:flex;gap:8px;align-items:flex-start}
.chat-msg.bot{flex-direction:row}
.chat-avatar{width:28px;height:28px;border-radius:4px;background:#1a1a2e;color:#5FA7F1;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;flex-shrink:0;margin-top:2px}
.chat-bubble{max-width:80%;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap}
.bot-bubble{background:#111;border:1px solid #222;color:#ddd}
.artifact-bubble{background:#1a1a0a;border:1px solid #333020;color:#FAD979}
.chat-time{font-size:10px;color:#555;margin-top:4px}
.chat-status{text-align:center;font-size:11px;color:#555;padding:4px 0}
.msg-highlight .chat-bubble{border-color:#5FA7F1 !important;box-shadow:0 0 8px rgba(95,167,241,0.3)}
.msg-highlight.chat-status{color:#5FA7F1}

/* Prompt area */
.prompt-section{padding:8px 12px;border-bottom:1px solid #1a1a1a;display:flex;flex-direction:column;gap:6px}
.prompt-display{font-size:12px;color:#888;padding:8px 10px;background:#0a0a0a;border-radius:4px;border:1px solid #1a1a1a;max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-word}
.prompt-display .prompt-text{color:#ccc}

/* Resume bar */
.resume-bar{padding:8px 12px;border-bottom:1px solid #1a1a1a;display:flex;gap:8px}
.resume-bar input{flex:1;background:#111;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#ccc;font-family:inherit;font-size:13px}
.resume-bar input:focus{outline:none;border-color:#5FA7F1}
.resume-bar input::placeholder{color:#444}

/* Controls bar */
.controls{padding:8px 12px;border-top:1px solid #1a1a1a;display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;background:#0d0d0d}
.btn{background:#151515;color:#ccc;border:1px solid #333;border-radius:4px;padding:5px 14px;font-family:inherit;font-size:12px;cursor:pointer;transition:all 0.15s}
.btn:hover{background:#222;color:#fff}
.btn:disabled{color:#444;border-color:#222;cursor:default;background:#0d0d0d}
.btn-green{border-color:#61D668;color:#61D668}.btn-green:hover{background:#0d1f0d}
.btn-red{border-color:#E94560;color:#E94560}.btn-red:hover{background:#1f0d0d}
.btn-blue{border-color:#5FA7F1;color:#5FA7F1}.btn-blue:hover{background:#0d0d1f}

/* Keepalive / disconnect labels */
.controls-group{display:flex;align-items:center;gap:6px}
.controls-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#555}
.ka-btn{font-size:11px;padding:3px 8px}
.ka-btn.active{border-color:#61D668;color:#61D668;background:#0d1f0d}
.timer{color:#666;font-size:11px;font-variant-numeric:tabular-nums}
.controls-sep{width:1px;height:20px;background:#222;margin:0 4px}
.info-label{font-size:10px;color:#444;max-width:200px;line-height:1.3}

/* Terminal */
.terminal-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}
#terminal-container{flex:1;padding:2px}

/* Warning */
.warning{background:rgba(233,69,96,0.08);border:1px solid rgba(233,69,96,0.2);color:#E94560;padding:8px 12px;margin:8px 12px;border-radius:4px;font-size:12px}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <span class="header-title"><a href="/dashboard" class="link">CLAUDEBOX</a></span>
  <span class="header-id">${shortId}</span>
  <span class="header-status ${status}">${status}${session.exit_code != null ? ` (${session.exit_code})` : ""}</span>
  <div class="header-meta">
    <span>${esc(user)}</span>
    <span>${esc(baseBranch)}</span>
    <span>${session.started ? timeAgo(session.started) : "\u2014"}</span>
    ${logUrl ? `<a href="${logUrl}" target="_blank" class="link">log</a>` : ""}
  </div>
</div>

${!worktreeAlive && worktreeId ? `<div class="warning">Workspace has been deleted. Terminal and resume are unavailable.</div>` : ""}

<!-- Layout: sidebar + main area -->
<div class="layout">

  <!-- Sidebar -->
  <div class="sidebar">
    ${prompt ? `<div class="sidebar-section"><div class="sidebar-label">Prompt</div><div class="prompt-display"><span class="prompt-text">${prompt.slice(0, 2000)}${prompt.length > 2000 ? "\u2026" : ""}</span></div></div>` : ""}

    ${isMultiSession ? `<div class="sidebar-section"><div class="sidebar-label">Sessions (${sessions.length})</div>${sessionRows}</div>` : ""}

    ${canJoin && worktreeAlive && worktreeId ? `<div class="resume-bar"><input id="resume-prompt" type="text" placeholder="Send a follow-up message\u2026" /><button id="resume-btn" class="btn btn-green" onclick="resumeSession()">Send</button></div>` : ""}
  </div>

  <!-- Main content: chat + terminal -->
  <div class="terminal-wrap">
    ${activity.length > 0 ? `<div class="chat-area" id="chat-area">${chatBubbles}</div>` : ""}
    <div id="terminal-container"></div>
  </div>

</div>

<!-- Controls bar -->
<div class="controls">
  <div class="controls-group">
    <button id="join-btn" class="btn btn-blue" ${canJoin && worktreeAlive ? "" : "disabled"}>${canJoin ? "Connect" : "Running\u2026"}</button>
    ${canCancel ? `<button id="cancel-btn" class="btn btn-red" onclick="cancelSession()">Cancel</button>` : ""}
  </div>

  <div class="controls-sep"></div>

  <div class="controls-group">
    <span class="controls-label">keepalive</span>
    <button class="btn ka-btn" data-min="15">15m</button>
    <button class="btn ka-btn" data-min="30">30m</button>
    <button class="btn ka-btn" data-min="60">60m</button>
    <span id="timer" class="timer"></span>
  </div>

  <div class="controls-sep"></div>

  <div class="controls-group">
    <span class="controls-label">disconnect</span>
    <span class="info-label">tmux session persists \u2014 reconnect anytime. Slack messages won't cancel it.</span>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script>
(function(){
  // Highlight message from ?msg= query param
  var msgParam=new URLSearchParams(location.search).get("msg");
  if(msgParam){
    var el=document.querySelector('[data-msg="'+msgParam+'"]');
    if(el){el.classList.add("msg-highlight");el.scrollIntoView({behavior:"smooth",block:"center"});}
  }

  var ID="${worktreeId || hash}";
  var WS_URL=(location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/s/"+ID+"/ws";
  var term,fitAddon,ws,keepaliveInterval;
  var joinBtn=document.getElementById("join-btn");
  var timerEl=document.getElementById("timer");
  var deadline=0;
  var keepaliveMins=5;

  if(joinBtn&&!joinBtn.disabled){
    joinBtn.addEventListener("click",function(){joinBtn.disabled=true;joinBtn.textContent="Connecting\u2026";startTerminal();});
  }

  function startTerminal(){
    var chatArea=document.getElementById("chat-area");
    if(chatArea)chatArea.style.display="none";
    var tc=document.getElementById("terminal-container");
    tc.style.flex="1";
    term=new window.Terminal({cursorBlink:true,fontSize:13,fontFamily:"'SF Mono',Monaco,'Cascadia Code',monospace",
      theme:{background:"#0a0a0a",foreground:"#ccc",cursor:"#5FA7F1",selectionBackground:"#1a2a4a",cursorAccent:"#0a0a0a"}});
    window.term=term;
    fitAddon=new window.FitAddon.FitAddon();term.loadAddon(fitAddon);
    term.open(tc);fitAddon.fit();
    ws=new WebSocket(WS_URL);ws.binaryType="arraybuffer";
    var gotFirstData=false;
    ws.onopen=function(){
      joinBtn.textContent="Starting\u2026";joinBtn.style.borderColor="#FAD979";joinBtn.style.color="#FAD979";
      ws.send(JSON.stringify({type:"resize",cols:term.cols,rows:term.rows}));
      deadline=Date.now()+5*60*1000;updateTimer();keepaliveInterval=setInterval(updateTimer,1000);
    };
    ws.onmessage=function(ev){
      if(!gotFirstData){gotFirstData=true;joinBtn.textContent="Connected";joinBtn.style.borderColor="#61D668";joinBtn.style.color="#61D668";}
      if(ev.data instanceof ArrayBuffer)term.write(new Uint8Array(ev.data));else term.write(ev.data);
    };
    ws.onclose=function(){
      term.write("\\r\\n\\x1b[1;33m[Disconnected \u2014 tmux session persists. Click Reconnect to rejoin.]\x1b[0m\\r\\n");
      joinBtn.textContent="Reconnect";joinBtn.style.borderColor="#5FA7F1";joinBtn.style.color="#5FA7F1";joinBtn.disabled=false;
      joinBtn.onclick=function(){term.dispose();startTerminal();};
      clearInterval(keepaliveInterval);
    };
    ws.onerror=function(){term.write("\\r\\n\\x1b[1;31m[Connection error]\x1b[0m\\r\\n");};
    term.onData(function(data){if(ws.readyState===WebSocket.OPEN)ws.send(data);});
    term.onResize(function(e){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"resize",cols:e.cols,rows:e.rows}));});
    window.addEventListener("resize",function(){fitAddon.fit();});
  }

  function updateTimer(){
    var rem=Math.max(0,Math.floor((deadline-Date.now())/1000));
    var m=Math.floor(rem/60),s=rem%60;
    timerEl.textContent=m+":"+(s<10?"0":"")+s;
    if(rem<=0)timerEl.textContent="expiring\u2026";
  }

  function extendKeepalive(mins){
    keepaliveMins=mins;
    fetch("/s/"+ID+"/keepalive",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({minutes:mins})}).then(function(r){return r.json();}).then(function(d){
      if(d.deadline)deadline=d.deadline;else deadline=Date.now()+mins*60*1000;
    }).catch(function(){});
    document.querySelectorAll(".ka-btn").forEach(function(b){b.classList.remove("active");});
    var active=document.querySelector('.ka-btn[data-min="'+mins+'"]');
    if(active)active.classList.add("active");
  }

  document.querySelectorAll(".ka-btn").forEach(function(btn){
    btn.addEventListener("click",function(){extendKeepalive(parseInt(btn.dataset.min));});
  });

  setInterval(function(){
    if(ws&&ws.readyState===WebSocket.OPEN){
      fetch("/s/"+ID+"/keepalive",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({minutes:keepaliveMins})}).then(function(r){return r.json();}).then(function(d){
        if(d.deadline)deadline=d.deadline;else deadline=Date.now()+keepaliveMins*60*1000;
      }).catch(function(){});
    }
  },120000);

  window.resumeSession=function(){
    var input=document.getElementById("resume-prompt");
    var prompt=(input&&input.value.trim())||"Continue from where you left off.";
    var btn=document.getElementById("resume-btn");
    if(btn){btn.disabled=true;btn.textContent="Starting…";}
    fetch("/s/"+ID+"/resume",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt:prompt})}).then(function(r){return r.json();}).then(function(d){
      if(d.ok){
        var newHash=d.log_url?d.log_url.split("/").pop():"";
        if(newHash)location.href="/s/"+newHash;
        else location.reload();
      } else {
        alert(d.message||"Could not resume session.");
        if(btn){btn.disabled=false;btn.textContent="Resume";}
      }
    }).catch(function(e){alert("Error: "+e.message);if(btn){btn.disabled=false;btn.textContent="Resume";}});
  };

  var resumeInput=document.getElementById("resume-prompt");
  if(resumeInput){resumeInput.addEventListener("keydown",function(e){if(e.key==="Enter")resumeSession();});}

  window.cancelSession=function(){
    if(!confirm("Cancel this session? Running containers will be stopped. (Disconnecting does NOT cancel.)")) return;
    fetch("/s/"+ID+"/cancel",{method:"POST"}).then(function(r){return r.json();}).then(function(d){
      if(d.ok){
        alert("Session cancelled.");
        location.reload();
      } else {
        alert(d.message||"Could not cancel session.");
      }
    }).catch(function(e){alert("Error: "+e.message);});
  };
})();
</script>
</body></html>`;
}

// ── Dashboard Page ─────────────────────────────────────────────

export interface WorkspaceGroup {
  worktreeId: string;
  sessions: SessionMeta[];      // newest first
  latestSession: SessionMeta;
  alive: boolean;
}

export interface ChannelGroup {
  channelId: string;
  channelName: string;
  workspaces: WorkspaceGroup[];
}

export function dashboardHTML(channels: ChannelGroup[]): string {
  const totalWorkspaces = channels.reduce((n, c) => n + c.workspaces.length, 0);

  const channelSections = channels.map(ch => {
    const rows = ch.workspaces.map(ws => {
      const s = ws.latestSession;
      const id = s._log_id || "";
      const prompt = esc((s.prompt || "").slice(0, 80));
      const exitStr = s.exit_code != null ? ` exit=${s.exit_code}` : "";
      const gc = !ws.alive ? " <span style=\"color:#888\">[deleted]</span>" : "";
      const dimStyle = !ws.alive ? ' style="opacity:0.5"' : "";
      return `<span${dimStyle}>  <a href="/s/${id}" style="color:#5FA7F1">${ws.worktreeId.slice(0, 8)}</a>  <span style="color:${statusColor(s.status || "")}">${(s.status || "?").padEnd(11)}</span>${exitStr.padEnd(8)}  ${esc((s.user || "?").padEnd(16))}  ${(s.started ? timeAgo(s.started) : "—").padEnd(10)}  ${ws.sessions.length} run${ws.sessions.length !== 1 ? "s" : " "}  ${prompt}${gc}</span>`;
    }).join("\n");

    return `\n<span style="color:#FAD979;font-weight:bold"><a href="#" style="color:#FAD979">#${esc(ch.channelName || ch.channelId)}</a></span> (${ch.workspaces.length})
${rows}`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox Dashboard</title>
<style>
${BASE_STYLES}
</style>
<script>
setInterval(function(){
  if(document.visibilityState==='visible'&&window.getSelection().toString()===''){
    fetch(location.href).then(function(r){return r.text();}).then(function(html){
      var parser=new DOMParser();var newDoc=parser.parseFromString(html,'text/html');
      document.body.innerHTML=newDoc.body.innerHTML;
    });
  }
},10000);
</script>
</head>
<body>
<div class="output"><span style="font-weight:bold;color:#5FA7F1">CLAUDEBOX DASHBOARD</span>: ${totalWorkspaces} workspace${totalWorkspaces !== 1 ? "s" : ""} across ${channels.length} channel${channels.length !== 1 ? "s" : ""}
${channelSections || "\nNo workspaces found."}
</div>
</body></html>`;
}
