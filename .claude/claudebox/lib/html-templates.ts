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

  // Session history
  const sessionLines = sessions.map(s => {
    const id = s._log_id || "";
    const isCurrent = id === hash;
    const marker = isCurrent ? ">" : " ";
    const exitStr = s.exit_code != null ? ` exit=${s.exit_code}` : "";
    const logLink = s.log_url ? ` <a href="${s.log_url}" target="_blank" style="color:#5FA7F1">log</a>` : "";
    return `${marker} <a href="/s/${id}" style="color:#5FA7F1">${id.slice(0, 8)}</a>  ${statusSpan(s.status || "?")}${exitStr}  ${s.started ? timeAgo(s.started) : "—"}${logLink}`;
  }).join("\n");

  // Activity entries
  const activityLines = activity.slice(0, 50).map(a => {
    const typeLabel = a.type.toUpperCase().padEnd(8);
    const text = esc(a.text.length > 300 ? a.text.slice(0, 300) + "…" : a.text);
    const linked = text.replace(/(https?:\/\/[^\s&]+)/g, '<a href="$1" target="_blank" style="color:#5FA7F1">$1</a>');
    const timeStr = a.ts ? timeAgo(a.ts).padEnd(10) : "          ";
    const color = a.type === "artifact" ? "#FAD979" : a.type === "response" ? "#ccc" : "#888";
    return `  ${timeStr} <span style="color:${color}">${typeLabel}</span> ${linked}`;
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
.controls{padding:6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.btn{background:#222;color:#ccc;border:1px solid #444;padding:4px 14px;font-family:monospace;font-size:13px;cursor:pointer}
.btn:hover{background:#333;color:#fff}
.btn:disabled{color:#555;border-color:#333;cursor:default}
.btn-green{border-color:#61D668;color:#61D668}.btn-green:hover{background:#1a3a1a}
.btn-red{border-color:#E94560;color:#E94560}.btn-red:hover{background:#3a1a1a}
.resume-bar{display:flex;gap:8px;padding:4px 0}
.resume-bar input{flex:1;background:#111;border:1px solid #444;padding:4px 8px;color:#ccc;font-family:monospace;font-size:13px}
.resume-bar input:focus{outline:none;border-color:#5FA7F1}
.resume-bar input::placeholder{color:#555}
.ka-btn{font-size:11px !important;padding:2px 8px !important}
.ka-btn.active{border-color:#61D668 !important;color:#61D668 !important}
#terminal-container{flex:1;padding:4px 0}
.main{display:flex;flex-direction:column;height:calc(100vh - ${isMultiSession ? "400" : activity.length > 0 ? "350" : "200"}px)}
</style>
</head>
<body>
<div class="output"><span style="font-weight:bold;color:#5FA7F1"><a href="/dashboard">CLAUDEBOX</a></span>: workspace <span style="color:#FAD979">${worktreeId ? worktreeId.slice(0, 8) : hash.slice(0, 8)}</span>
${!worktreeAlive && worktreeId ? `\n<span style="color:#E94560;font-weight:bold">WARNING: Workspace has been deleted. Terminal and resume are unavailable.</span>\n` : ""}
  user:   <span style="color:#fff">${esc(user)}</span>
  status: ${statusSpan(status)}${session.exit_code != null ? ` (exit ${session.exit_code})` : ""}
  base:   ${esc(baseBranch)}
  start:  ${session.started ? timeAgo(session.started) : "—"}${logUrl ? `
  log:    <a href="${logUrl}" target="_blank" style="color:#5FA7F1">${logUrl}</a>` : ""}${prompt ? `
  prompt: ${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}` : ""}
${isMultiSession ? `
<span style="font-weight:bold">Sessions</span> (${sessions.length} runs):
${sessionLines}
` : ""}${activity.length > 0 ? `
<span style="font-weight:bold">Activity</span> (${activity.length}):
${activityLines}
` : ""}</div>
${canJoin && worktreeAlive && worktreeId ? `
<div class="resume-bar">
  <input id="resume-prompt" type="text" placeholder="Continue from where you left off." />
  <button id="resume-btn" class="btn btn-green" onclick="resumeSession()">Resume</button>
</div>` : ""}
<div class="controls">
  <button id="join-btn" class="btn" ${canJoin && worktreeAlive ? "" : "disabled"}>${canJoin ? "[Terminal]" : "[Running…]"}</button>
  ${canCancel ? `<button id="cancel-btn" class="btn btn-red" onclick="cancelSession()">[Cancel]</button>` : ""}
  <span id="timer" style="color:#888;font-size:12px"></span>
  <button class="btn ka-btn" data-min="15">15m</button>
  <button class="btn ka-btn" data-min="30">30m</button>
  <button class="btn ka-btn" data-min="60">60m</button>
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
    joinBtn.addEventListener("click",function(){joinBtn.disabled=true;joinBtn.textContent="[Connecting…]";startTerminal();});
  }

  function startTerminal(){
    term=new window.Terminal({cursorBlink:true,fontSize:14,fontFamily:"monospace",
      theme:{background:"#000",foreground:"#ccc",cursor:"#fff",selectionBackground:"#333"}});
    window.term=term;
    fitAddon=new window.FitAddon.FitAddon();term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal-container"));fitAddon.fit();
    ws=new WebSocket(WS_URL);ws.binaryType="arraybuffer";
    var gotFirstData=false;
    ws.onopen=function(){
      joinBtn.textContent="[Starting…]";joinBtn.style.borderColor="#FAD979";joinBtn.style.color="#FAD979";
      ws.send(JSON.stringify({type:"resize",cols:term.cols,rows:term.rows}));
      deadline=Date.now()+5*60*1000;updateTimer();keepaliveInterval=setInterval(updateTimer,1000);
    };
    ws.onmessage=function(ev){
      if(!gotFirstData){gotFirstData=true;joinBtn.textContent="[Connected]";joinBtn.style.borderColor="#61D668";joinBtn.style.color="#61D668";}
      if(ev.data instanceof ArrayBuffer)term.write(new Uint8Array(ev.data));else term.write(ev.data);
    };
    ws.onclose=function(){
      term.write("\\r\\n\\x1b[1;31m[Disconnected]\\x1b[0m\\r\\n");
      joinBtn.textContent="[Reconnect]";joinBtn.style.borderColor="#5FA7F1";joinBtn.style.color="#5FA7F1";joinBtn.disabled=false;
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
    timerEl.textContent="keepalive: "+m+":"+(s<10?"0":"")+s;
    if(rem<=0)timerEl.textContent="session expiring…";
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

  window.resumeSession=function(){
    var input=document.getElementById("resume-prompt");
    var prompt=(input&&input.value.trim())||"Continue from where you left off.";
    var btn=document.getElementById("resume-btn");
    if(btn){btn.disabled=true;btn.textContent="Starting…";}
    fetch("/s/"+HASH+"/resume",{method:"POST",headers:{"Content-Type":"application/json"},
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
