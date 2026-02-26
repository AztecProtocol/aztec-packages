import type { SessionMeta } from "./types.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function cancelConfirmHTML(hash: string, session: SessionMeta): string {
  const status = session.status || "unknown";
  const user = session.user || "unknown";
  const prompt = escapeHtml(session.prompt || "");
  const canCancel = status === "running" || status === "interactive";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cancel Session</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;display:flex;justify-content:center;padding-top:80px}
.card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:32px;max-width:500px;width:100%}
h1{color:#e94560;font-size:20px;margin-bottom:16px}
.info{font-size:14px;color:#a0a0b0;margin-bottom:8px}
.info b{color:#c0c0d0}
.warn{background:#4d1a1a;border:1px solid #e94560;border-radius:4px;padding:12px;margin:20px 0;font-size:14px;color:#e0a0a0}
.buttons{display:flex;gap:12px;margin-top:20px}
button,a.btn{padding:10px 24px;border:none;border-radius:4px;font-size:14px;cursor:pointer;font-weight:600;text-decoration:none;text-align:center}
.cancel-btn{background:#e94560;color:white}
.cancel-btn:hover{background:#c73e55}
.cancel-btn:disabled{background:#555;cursor:not-allowed}
.back-btn{background:#2a3a5e;color:#a0a0b0}
.back-btn:hover{background:#3a4a6e}
.status-pill{font-size:12px;padding:3px 10px;border-radius:12px;font-weight:600}
.status-running{background:#1a4d2e;color:#4ae168}
.status-interactive{background:#4d3a1a;color:#e1a14a}
.status-completed{background:#1a3a4d;color:#4ac1e1}
.status-cancelled{background:#3a3a3a;color:#a0a0a0}
</style></head><body>
<div class="card">
<h1>Cancel Session</h1>
<div class="info"><b>Session:</b> ${hash.slice(0, 8)}...</div>
<div class="info"><b>User:</b> ${user}</div>
<div class="info"><b>Status:</b> <span class="status-pill status-${status}">${status}</span></div>
${prompt ? `<div class="info"><b>Prompt:</b> ${prompt.slice(0, 120)}${prompt.length > 120 ? "..." : ""}</div>` : ""}
${canCancel ? `
<div class="warn">This will immediately stop the session's Docker containers. Any in-progress work will be lost.</div>
<form method="POST" action="/s/${hash}/cancel">
<div class="buttons">
<button type="submit" class="cancel-btn">Yes, Cancel Session</button>
<a href="/s/${hash}" class="btn back-btn">Go Back</a>
</div>
</form>
` : `
<div class="info" style="margin-top:20px">Session is already <b>${status}</b> — nothing to cancel.</div>
<div class="buttons"><a href="/s/${hash}" class="btn back-btn">Go Back</a></div>
`}
</div></body></html>`;
}

export function cancelResultHTML(hash: string, cancelled: boolean): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session ${cancelled ? "Cancelled" : "Not Changed"}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a2e;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;display:flex;justify-content:center;padding-top:80px}
.card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:32px;max-width:500px;width:100%;text-align:center}
h1{font-size:20px;margin-bottom:16px}
.ok{color:#4ae168}
.noop{color:#a0a0b0}
a{color:#539bf5;margin-top:16px;display:inline-block}
</style></head><body>
<div class="card">
${cancelled
  ? `<h1 class="ok">Session Cancelled</h1><p>Containers have been stopped and cleaned up.</p>`
  : `<h1 class="noop">No Change</h1><p>Session was already stopped or not found.</p>`}
<a href="/s/${hash}">Back to session</a>
</div></body></html>`;
}

export function interactiveSessionHTML(hash: string, session: SessionMeta): string {
  const started = session.started || "?";
  const finished = session.finished || "\u2014";
  const exitCode = session.exit_code ?? "\u2014";
  const user = session.user || "unknown";
  const prompt = escapeHtml(session.prompt || "");
  const logUrl = session.log_url || "";
  const worktreeId = session.worktree_id || "";
  const status = session.status || "unknown";
  const canJoin = status !== "running";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClaudeBox Session</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#1a1a2e; color:#e0e0e0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace; }
.header { padding:16px 20px; background:#16213e; border-bottom:1px solid #0f3460; }
.header h1 { font-size:18px; color:#e94560; margin-bottom:8px; }
.meta { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:4px 16px; font-size:13px; color:#a0a0b0; }
.meta span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.meta b { color:#c0c0d0; }
.meta a { color:#539bf5; }
.prompt-line { margin-top:6px; font-size:13px; color:#a0a0b0; max-height:40px; overflow:hidden; }
.controls { padding:8px 20px; background:#16213e; display:flex; align-items:center; gap:12px; }
.controls button { padding:8px 20px; border:none; border-radius:4px; font-size:14px; cursor:pointer; font-weight:600; }
#join-btn { background:#e94560; color:white; }
#join-btn:hover { background:#c73e55; }
#join-btn:disabled { background:#555; cursor:not-allowed; }
.status-pill { font-size:12px; padding:3px 10px; border-radius:12px; font-weight:600; }
.status-running { background:#1a4d2e; color:#4ae168; }
.status-completed { background:#1a3a4d; color:#4ac1e1; }
.status-error { background:#4d1a1a; color:#e14a4a; }
.status-interactive { background:#4d3a1a; color:#e1a14a; }
.status-cancelled { background:#3a3a3a; color:#a0a0a0; }
#timer { font-size:13px; color:#a0a0b0; }
.ka-btn { padding:4px 10px !important; font-size:12px !important; background:#2a3a5e; color:#a0a0b0; font-weight:600; }
.ka-btn:hover { background:#3a4a6e; color:#e0e0e0; }
.ka-btn.active { background:#1a4d2e; color:#4ae168; }
#terminal-container { flex:1; padding:4px; }
.main { display:flex; flex-direction:column; height:calc(100vh - 120px); }
</style>
</head>
<body>
<div class="header">
  <h1>ClaudeBox Session <span style="font-size:13px;color:#a0a0b0">${hash.slice(0, 8)}...</span></h1>
  <div class="meta">
    <span><b>User:</b> ${user}</span>
    <span><b>Started:</b> ${started}</span>
    <span><b>Finished:</b> ${finished}</span>
    <span><b>Exit:</b> ${exitCode} <span class="status-pill status-${status}">${status}</span></span>
    ${logUrl ? `<span><b>Log:</b> <a href="${logUrl}" target="_blank">${logUrl}</a></span>` : ""}
    ${worktreeId ? `<span><b>Worktree:</b> <code style="font-size:11px">${worktreeId}</code></span>` : ""}
  </div>
  ${prompt ? `<div class="prompt-line"><b>Prompt:</b> ${prompt.slice(0, 200)}</div>` : ""}
</div>
<div class="controls">
  <button id="join-btn" ${canJoin ? "" : "disabled"}>Join Session</button>
  <a href="/s/${hash}/cancel" style="padding:8px 16px;background:#2a3a5e;color:#e94560;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600">Cancel</a>
  <span id="timer"></span>
  <button class="ka-btn" data-min="15">15m</button>
  <button class="ka-btn" data-min="30">30m</button>
  <button class="ka-btn" data-min="60">60m</button>
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
  joinBtn.addEventListener("click",function(){joinBtn.disabled=true;joinBtn.textContent="Connecting...";startTerminal();});
  function startTerminal(){
    term=new window.Terminal({cursorBlink:true,fontSize:14,fontFamily:"'JetBrains Mono','Fira Code',Menlo,monospace",
      theme:{background:"#1a1a2e",foreground:"#e0e0e0",cursor:"#e94560",selectionBackground:"#3a3a5e"}});
    window.term=term;
    fitAddon=new window.FitAddon.FitAddon();term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal-container"));fitAddon.fit();
    ws=new WebSocket(WS_URL);ws.binaryType="arraybuffer";
    var gotFirstData=false;
    ws.onopen=function(){
      joinBtn.textContent="Starting...";joinBtn.style.background="#4d3a1a";
      ws.send(JSON.stringify({type:"resize",cols:term.cols,rows:term.rows}));
      deadline=Date.now()+5*60*1000;updateTimer();keepaliveInterval=setInterval(updateTimer,1000);
    };
    ws.onmessage=function(ev){
      if(!gotFirstData){gotFirstData=true;joinBtn.textContent="Connected";joinBtn.style.background="#1a4d2e";}
      if(ev.data instanceof ArrayBuffer)term.write(new Uint8Array(ev.data));else term.write(ev.data);
    };
    ws.onclose=function(){
      term.write("\\r\\n\\x1b[1;31m[Disconnected]\\x1b[0m\\r\\n");
      joinBtn.textContent="Reconnect";joinBtn.style.background="#e94560";joinBtn.disabled=false;
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
    if(rem<=0)timerEl.textContent="Session expiring...";
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
})();
</script>
</body></html>`;
}
