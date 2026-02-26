import type { SessionMeta } from "./types.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function statusClass(s: string): string {
  if (s === "running") return "st-running";
  if (s === "interactive") return "st-interactive";
  if (s === "completed") return "st-completed";
  if (s === "error") return "st-error";
  if (s === "cancelled") return "st-cancelled";
  return "st-unknown";
}

// ── Shared styles ──────────────────────────────────────────────

const BASE_STYLES = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace}
a{color:#539bf5;text-decoration:none}a:hover{text-decoration:underline}
.pill{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;display:inline-block}
.st-running{background:#1a4d2e;color:#4ae168}
.st-interactive{background:#4d3a1a;color:#e1a14a}
.st-completed{background:#1a3a4d;color:#4ac1e1}
.st-error{background:#4d1a1a;color:#e14a4a}
.st-cancelled{background:#3a3a3a;color:#a0a0a0}
.st-unknown{background:#2a2a3a;color:#888}
code{background:#2a2a3e;padding:1px 5px;border-radius:3px;font-size:12px}
.btn{padding:8px 18px;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-weight:600;text-decoration:none;display:inline-block}
.btn:hover{filter:brightness(1.15)}
.btn-red{background:#e94560;color:#fff}
.btn-blue{background:#2a5a8e;color:#e0e0e0}
.btn-green{background:#1a6e3e;color:#e0e0e0}
.btn-dim{background:#2a3a5e;color:#a0a0b0}
`;

// ── Workspace Page ─────────────────────────────────────────────

export interface WorkspacePageData {
  hash: string;            // current session log_id
  session: SessionMeta;    // current session
  sessions: SessionMeta[]; // all sessions for this worktree (newest first)
  worktreeAlive: boolean;
}

export function workspacePageHTML(data: WorkspacePageData): string {
  const { hash, session, sessions, worktreeAlive } = data;
  const worktreeId = session.worktree_id || "";
  const status = session.status || "unknown";
  const user = session.user || "unknown";
  const prompt = escapeHtml(session.prompt || "");
  const logUrl = session.log_url || "";
  const baseBranch = session.base_branch || "next";
  const canJoin = status !== "running";
  const canCancel = status === "running" || status === "interactive";
  const isMultiSession = sessions.length > 1;

  // Session history rows
  const sessionRows = sessions.map(s => {
    const id = s._log_id || "";
    const isCurrent = id === hash;
    const exitBadge = s.exit_code != null
      ? `<span class="pill ${s.exit_code === 0 ? 'st-completed' : 'st-error'}">${s.exit_code}</span>`
      : "";
    return `<tr${isCurrent ? ' class="current-row"' : ""}>
      <td><a href="/s/${id}">${id.slice(0, 8)}…</a></td>
      <td><span class="pill ${statusClass(s.status || "")}">${s.status || "?"}</span> ${exitBadge}</td>
      <td>${s.started ? timeAgo(s.started) : "—"}</td>
      <td>${s.log_url ? `<a href="${s.log_url}" target="_blank">log</a>` : "—"}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox — ${worktreeId ? worktreeId.slice(0, 8) : hash.slice(0, 8)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
${BASE_STYLES}
.header{padding:16px 20px;background:#16213e;border-bottom:1px solid #0f3460}
.header h1{font-size:18px;color:#e94560;margin-bottom:8px}
.meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px;color:#a0a0b0}
.meta b{color:#c0c0d0}
.prompt-line{margin-top:6px;font-size:13px;color:#a0a0b0;max-height:40px;overflow:hidden;text-overflow:ellipsis}
.warn-banner{background:#4d2a1a;border:1px solid #e94560;padding:8px 16px;font-size:13px;color:#e0a0a0;margin:8px 20px;border-radius:4px}
.controls{padding:8px 20px;background:#16213e;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#timer{font-size:13px;color:#a0a0b0}
.ka-btn{padding:4px 10px !important;font-size:11px !important}
.ka-btn.active{background:#1a4d2e !important;color:#4ae168 !important}
.sessions-panel{padding:12px 20px;max-height:180px;overflow-y:auto;border-bottom:1px solid #0f3460}
.sessions-panel h3{font-size:13px;color:#a0a0b0;margin-bottom:6px}
.sessions-panel table{width:100%;border-collapse:collapse;font-size:12px}
.sessions-panel th{text-align:left;color:#a0a0b0;font-weight:600;padding:3px 8px;border-bottom:1px solid #1a2a4e}
.sessions-panel td{padding:3px 8px}
.sessions-panel .current-row{background:#1a2a4e}
.main{display:flex;flex-direction:column;height:calc(100vh - ${isMultiSession ? "320" : "140"}px)}
#terminal-container{flex:1;padding:4px}
</style>
</head>
<body>
<div class="header">
  <h1>ClaudeBox ${worktreeId ? `Workspace <code>${worktreeId.slice(0, 8)}</code>` : `Session <code>${hash.slice(0, 8)}</code>`}</h1>
  <div class="meta">
    <span><b>User:</b> ${escapeHtml(user)}</span>
    <span><b>Status:</b> <span class="pill ${statusClass(status)}">${status}</span></span>
    ${session.exit_code != null ? `<span><b>Exit:</b> ${session.exit_code}</span>` : ""}
    <span><b>Base:</b> ${escapeHtml(baseBranch)}</span>
    ${session.started ? `<span><b>Started:</b> ${timeAgo(session.started)}</span>` : ""}
    ${logUrl ? `<span><a href="${logUrl}" target="_blank">View log</a></span>` : ""}
    <span><a href="/dashboard">Dashboard</a></span>
  </div>
  ${prompt ? `<div class="prompt-line"><b>Prompt:</b> ${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}</div>` : ""}
</div>
${!worktreeAlive && worktreeId ? '<div class="warn-banner">Workspace has been deleted. Terminal and resume are unavailable.</div>' : ""}
${isMultiSession ? `
<div class="sessions-panel">
  <h3>Session History (${sessions.length} runs)</h3>
  <table>
    <tr><th>ID</th><th>Status</th><th>When</th><th>Log</th></tr>
    ${sessionRows}
  </table>
</div>` : ""}
<div class="controls">
  <button id="join-btn" class="btn btn-green" ${canJoin && worktreeAlive ? "" : "disabled"}>${canJoin ? "Resume Session" : "Running…"}</button>
  ${canCancel ? `<button id="cancel-btn" class="btn btn-red" onclick="cancelSession()">Cancel</button>` : ""}
  <span id="timer"></span>
  <button class="btn btn-dim ka-btn" data-min="15">15m</button>
  <button class="btn btn-dim ka-btn" data-min="30">30m</button>
  <button class="btn btn-dim ka-btn" data-min="60">60m</button>
</div>
<div class="main">
  <div id="terminal-container"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script>
(function(){
  var HASH="${hash}";
  var WS_URL=(location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/s/"+HASH+"/ws";
  var term,fitAddon,ws,keepaliveInterval;
  var joinBtn=document.getElementById("join-btn");
  var timerEl=document.getElementById("timer");
  var deadline=0;
  var keepaliveMins=5;

  if(joinBtn&&!joinBtn.disabled){
    joinBtn.addEventListener("click",function(){joinBtn.disabled=true;joinBtn.textContent="Connecting…";startTerminal();});
  }

  function startTerminal(){
    term=new window.Terminal({cursorBlink:true,fontSize:14,fontFamily:"'JetBrains Mono','Fira Code',Menlo,monospace",
      theme:{background:"#1a1a2e",foreground:"#e0e0e0",cursor:"#e94560",selectionBackground:"#3a3a5e"}});
    window.term=term;
    fitAddon=new window.FitAddon.FitAddon();term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal-container"));fitAddon.fit();
    ws=new WebSocket(WS_URL);ws.binaryType="arraybuffer";
    var gotFirstData=false;
    ws.onopen=function(){
      joinBtn.textContent="Starting…";joinBtn.style.background="#4d3a1a";
      ws.send(JSON.stringify({type:"resize",cols:term.cols,rows:term.rows}));
      deadline=Date.now()+5*60*1000;updateTimer();keepaliveInterval=setInterval(updateTimer,1000);
    };
    ws.onmessage=function(ev){
      if(!gotFirstData){gotFirstData=true;joinBtn.textContent="Connected";joinBtn.style.background="#1a4d2e";}
      if(ev.data instanceof ArrayBuffer)term.write(new Uint8Array(ev.data));else term.write(ev.data);
    };
    ws.onclose=function(){
      term.write("\\r\\n\\x1b[1;31m[Disconnected]\\x1b[0m\\r\\n");
      joinBtn.textContent="Reconnect";joinBtn.style.background="#2a5a8e";joinBtn.disabled=false;
      joinBtn.onclick=function(){term.dispose();startTerminal();};
      clearInterval(keepaliveInterval);timerEl.textContent="";
    };
    ws.onerror=function(){term.write("\\r\\n\\x1b[1;31m[Connection error]\\x1b[0m\\r\\n");};
    term.onData(function(data){if(ws.readyState===WebSocket.OPEN)ws.send(data);});
    term.onResize(function(e){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"resize",cols:e.cols,rows:e.rows}));});
    window.addEventListener("resize",function(){fitAddon.fit();});
  }

  function updateTimer(){
    var rem=Math.max(0,Math.floor((deadline-Date.now())/1000));
    var m=Math.floor(rem/60),s=rem%60;
    timerEl.textContent="Keepalive: "+m+":"+(s<10?"0":"")+s;
    if(rem<=0)timerEl.textContent="Session expiring…";
  }

  function extendKeepalive(mins){
    keepaliveMins=mins;
    fetch("/s/"+HASH+"/keepalive",{method:"POST",headers:{"Content-Type":"application/json"},
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
      fetch("/s/"+HASH+"/keepalive",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({minutes:keepaliveMins})}).then(function(r){return r.json();}).then(function(d){
        if(d.deadline)deadline=d.deadline;else deadline=Date.now()+keepaliveMins*60*1000;
      }).catch(function(){});
    }
  },120000);

  window.cancelSession=function(){
    if(!confirm("Cancel this session? Running containers will be stopped.")) return;
    fetch("/s/"+HASH+"/cancel",{method:"POST"}).then(function(r){return r.json();}).then(function(d){
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
      const prompt = escapeHtml((s.prompt || "").slice(0, 100));
      const exitBadge = s.exit_code != null
        ? `<span class="pill ${s.exit_code === 0 ? 'st-completed' : 'st-error'}">${s.exit_code}</span>`
        : "";
      return `<tr${!ws.alive ? ' class="gc-row"' : ""}>
        <td><a href="/s/${id}"><code>${ws.worktreeId.slice(0, 8)}</code></a></td>
        <td><span class="pill ${statusClass(s.status || "")}">${s.status || "?"}</span> ${exitBadge}</td>
        <td>${escapeHtml(s.user || "?")}</td>
        <td class="prompt-cell">${prompt}</td>
        <td>${ws.sessions.length}</td>
        <td>${s.started ? timeAgo(s.started) : "—"}</td>
        <td>${!ws.alive ? '<span class="pill st-cancelled">deleted</span>' : ""}</td>
      </tr>`;
    }).join("\n");

    return `
    <div class="channel-section">
      <h2>#${escapeHtml(ch.channelName || ch.channelId)}</h2>
      <table>
        <tr><th>Workspace</th><th>Status</th><th>User</th><th>Prompt</th><th>Runs</th><th>Last Run</th><th></th></tr>
        ${rows}
      </table>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox Dashboard</title>
<style>
${BASE_STYLES}
.dashboard{max-width:1200px;margin:0 auto;padding:20px}
.dashboard h1{font-size:22px;color:#e94560;margin-bottom:4px}
.dashboard .subtitle{font-size:13px;color:#a0a0b0;margin-bottom:20px}
.channel-section{margin-bottom:24px;background:#16213e;border:1px solid #0f3460;border-radius:6px;overflow:hidden}
.channel-section h2{font-size:15px;color:#e0e0e0;padding:10px 16px;background:#0f1a2e;border-bottom:1px solid #0f3460}
.channel-section table{width:100%;border-collapse:collapse;font-size:12px}
.channel-section th{text-align:left;color:#a0a0b0;font-weight:600;padding:6px 12px;border-bottom:1px solid #1a2a4e}
.channel-section td{padding:6px 12px;border-bottom:1px solid #0f1a2e}
.channel-section tr:hover{background:#1a2a4e}
.gc-row{opacity:0.6}
.prompt-cell{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a0a0b0}
</style>
</head>
<body>
<div class="dashboard">
  <h1>ClaudeBox Dashboard</h1>
  <div class="subtitle">${totalWorkspaces} workspace${totalWorkspaces !== 1 ? "s" : ""} across ${channels.length} channel${channels.length !== 1 ? "s" : ""}</div>
  ${channelSections || '<p style="color:#a0a0b0">No workspaces found.</p>'}
</div>
</body></html>`;
}
