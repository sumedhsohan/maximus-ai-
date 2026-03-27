/* ============================================================
   MAXIMUS AI — script.js v8.0
   ► PASTE YOUR MISTRAL API KEY (free: console.mistral.ai):
============================================================ */
const MISTRAL_API_KEY = "93oblKWH0yX38ND8e9WLY6YhcSQtlFV9";
const MISTRAL_MODEL   = "mistral-small-latest";
const WEATHER_API_KEY = ""; // optional: openweathermap.org
/* ========================================================== */

// ─── STATE ───────────────────────────────────────────────────
const state = {
  isAwake:false, isSpeaking:false, isProcessing:false,
  wakeWord:"maximus",
  memory:[], alarms:[], contacts:[], chatHistory:[],
  fileSlots:[],        // { name, label, type, content, b64, mediaType }
  activeFileIdx:-1,    // which file the user last asked about
  sessionStart:Date.now(), msgCount:0,
  rec:null, synth:window.speechSynthesis,
  recRunning:false, _waveInt:null, _startRec:null,
  lang:"en-IN",
};

// ─── BOOT ────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded",()=>{
  loadStorage();
  updateDateTime(); setInterval(updateDateTime,1000);
  updateSessionTimer(); setInterval(updateSessionTimer,30000);
  initParticles(); initWaveBars();
  buildSpeechEngine();
  startAlarmChecker();
  checkApiKey();
  renderMemory(); renderAlarms(); renderContacts(); renderFileSlots();
  initNotifications();
  startSmartNotifChecker();
  logActivity("MAXIMUS v11 online");
  addChat("system",'MAXIMUS v11 online. New: 🖼️ Image Generation · 📝 Meeting Notes · 🌍 Real-Time Translation. Say <b>"Maximus [command]"</b> or type.');
});

// ─── STORAGE ─────────────────────────────────────────────────
function loadStorage(){
  try{
    state.memory      = JSON.parse(localStorage.getItem("mx_memory")   ||"[]");
    state.alarms      = JSON.parse(localStorage.getItem("mx_alarms")   ||"[]");
    state.contacts    = JSON.parse(localStorage.getItem("mx_contacts") ||"[]");
    state.chatHistory = JSON.parse(localStorage.getItem("mx_history")  ||"[]");
    const sl=localStorage.getItem("mx_lang"); if(sl)state.lang=sl;
  }catch(e){state.memory=[];state.alarms=[];state.contacts=[];state.chatHistory=[];state.lang="en-IN";}
}
const P={
  mem:  ()=>{try{localStorage.setItem("mx_memory",  JSON.stringify(state.memory));}catch(e){}},
  alm:  ()=>{try{localStorage.setItem("mx_alarms",  JSON.stringify(state.alarms));}catch(e){}},
  con:  ()=>{try{localStorage.setItem("mx_contacts",JSON.stringify(state.contacts));}catch(e){}},
  hist: ()=>{try{localStorage.setItem("mx_history", JSON.stringify(state.chatHistory.slice(-60)));}catch(e){}},
  lang: ()=>{try{localStorage.setItem("mx_lang",    state.lang);}catch(e){}},
};

// ─── DATE/TIME ───────────────────────────────────────────────
function updateDateTime(){
  const n=new Date();
  document.getElementById("timeDisplay").textContent=n.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  document.getElementById("dateDisplay").textContent=n.toLocaleDateString("en-IN",{weekday:"short",year:"numeric",month:"short",day:"numeric"});
}
function getNow(){return new Date().toLocaleString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});}
function updateSessionTimer(){
  const m=Math.floor((Date.now()-state.sessionStart)/60000);
  const el=document.getElementById("sessionTime");
  if(el)el.textContent=m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`;
}

// ─── PARTICLES ───────────────────────────────────────────────
function initParticles(){
  const cv=document.getElementById("particleCanvas"),cx=cv.getContext("2d");
  let W,H,pts=[];
  const resize=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;};
  resize();addEventListener("resize",resize);
  for(let i=0;i<80;i++)pts.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,r:Math.random()*1.8+.3,ph:Math.random()*Math.PI*2});
  (function draw(){
    cx.clearRect(0,0,W,H);
    pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.ph+=.007;if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
      const a=(Math.sin(p.ph)*.5+.5)*.45;cx.beginPath();cx.arc(p.x,p.y,p.r,0,Math.PI*2);cx.fillStyle=`rgba(0,229,255,${a})`;cx.fill();});
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<110){cx.beginPath();cx.moveTo(pts[i].x,pts[i].y);cx.lineTo(pts[j].x,pts[j].y);cx.strokeStyle=`rgba(0,229,255,${.09*(1-d/110)})`;cx.lineWidth=.5;cx.stroke();}
    }
    requestAnimationFrame(draw);
  })();
}

// ─── WAVE BARS ───────────────────────────────────────────────
function initWaveBars(){
  const bars=document.querySelectorAll(".wave-bar");
  state.startWave=()=>{clearInterval(state._waveInt);state._waveInt=setInterval(()=>bars.forEach(b=>{b.style.height=(4+Math.random()*30)+"px";b.style.opacity=(.35+Math.random()*.65).toString();}),70);};
  state.stopWave=()=>{clearInterval(state._waveInt);bars.forEach(b=>{b.style.height="4px";b.style.opacity=".2";});};
}

// ─── LANGUAGE ────────────────────────────────────────────────
const LANG_MAP={"en-IN":"English (India)","hi-IN":"Hindi","ta-IN":"Tamil","te-IN":"Telugu","kn-IN":"Kannada","ml-IN":"Malayalam","mr-IN":"Marathi","gu-IN":"Gujarati","bn-IN":"Bengali","pa-IN":"Punjabi","ur-IN":"Urdu","en-US":"English (US)"};
function setLanguage(lang){
  state.lang=lang;P.lang();
  if(state.rec){try{state.rec.abort();}catch(e){} state.recRunning=false;}
  setTimeout(()=>state._startRec&&state._startRec(),300);
  const name=LANG_MAP[lang]||lang;
  const el=document.getElementById("langDisplay");if(el)el.textContent=lang.toUpperCase().replace("-","−");
  addChat("system",`🌐 Language: <b>${name}</b>`);
  speak(`Language changed to ${name}`);
}

// ─── SPEECH ENGINE ───────────────────────────────────────────
// Design:
//   • non-continuous (single utterance) — no timeouts, clean results
//   • interimResults=true — live text even during slow speech
//   • maxAlternatives=5 — pick best across Chrome mishearings
//   • 80ms restart — feels instant and responsive
//   • Transcript shows LIVE what mic is hearing character by character
function buildSpeechEngine(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addChat("system","⚠️ Voice recognition needs Chrome or Edge. Use the text box.");return;}

  function makeRec(){
    const r=new SR();
    r.continuous     = false;   // single utterance = full clean sentence
    r.interimResults = true;    // show live partial text while user speaks
    r.lang           = state.lang;
    r.maxAlternatives= 5;       // try all 5 alternatives for best match

    r.onstart=()=>{
      state.recRunning=true;
      document.getElementById("transcriptContent").textContent="Listening…";
      if(state.isAwake){setListenUI(true);state.startWave();}
    };

    r.onend=()=>{
      state.recRunning=false;
      if(!state.isSpeaking)setTimeout(startRec,80);  // 80ms = near-instant restart
    };

    r.onerror=(e)=>{
      state.recRunning=false;
      if(["network","audio-capture","service-not-allowed","not-allowed"].includes(e.error)){
        document.getElementById("transcriptContent").textContent="⚠️ Mic blocked — allow microphone access.";
        addChat("system",`⚠️ Mic error: <b>${e.error}</b> — allow microphone in browser settings (🔒 icon in address bar).`);
        setTimeout(startRec,3000);return;
      }
      // All other errors (no-speech, aborted) → restart quickly
      setTimeout(startRec,80);
    };

    r.onresult=(e)=>{
      if(state.isSpeaking)return;
      let fin="",intr="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        // Pick the highest-confidence alternative
        // This is how we handle Chrome mishearing "saying" as "sing" etc.
        let best=e.results[i][0].transcript,bc=e.results[i][0].confidence||0;
        for(let a=1;a<e.results[i].length;a++){
          const c=e.results[i][a].confidence||0;
          if(c>bc){best=e.results[i][a].transcript;bc=c;}
        }
        if(e.results[i].isFinal) fin+=best+" ";
        else intr+=best;
      }
      // Show live what mic is hearing
      const live=(fin||intr).trim();
      if(live) document.getElementById("transcriptContent").textContent=live;
      // Only process when we have a final result
      if(fin.trim()) handleSpeech(fin.trim());
    };
    return r;
  }

  function startRec(){
    if(state.recRunning||state.isSpeaking)return;
    try{
      state.rec=makeRec();
      state.rec.start();
    }catch(err){
      console.warn("Speech rec error:",err);
      setTimeout(startRec,500);
    }
  }
  state._startRec=startRec;
  startRec();
}

function resumeRec(){
  if(state.rec){try{state.rec.abort();}catch(e){}} state.recRunning=false;
  setTimeout(()=>state._startRec&&state._startRec(),350);
}

// ─── SPEECH HANDLER ──────────────────────────────────────────
function handleSpeech(text){
  const lo=text.toLowerCase().trim();
  const hasWake=lo.includes(state.wakeWord);
  if(!state.isAwake){
    if(!hasWake)return;
    wakeUp();
    const afterWake=text.replace(/maximus\s*/gi,"").trim();
    if(afterWake.length>2)setTimeout(()=>processInput(afterWake),450);
    return;
  }
  if(/^(stop|sleep|shut up|go to sleep|deactivate|quiet|pause|bye|goodbye)/i.test(lo)){goSleep();return;}
  const langCmd=lo.match(/(?:speak|switch|change|set|use)\s+(?:language\s+)?(?:to\s+)?(hindi|tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|punjabi|urdu|english)/i);
  if(langCmd){
    const codes={hindi:"hi-IN",tamil:"ta-IN",telugu:"te-IN",kannada:"kn-IN",malayalam:"ml-IN",marathi:"mr-IN",gujarati:"gu-IN",bengali:"bn-IN",punjabi:"pa-IN",urdu:"ur-IN",english:"en-IN"};
    const code=codes[langCmd[1].toLowerCase()];if(code){setLanguage(code);return;}
  }
  if(hasWake){
    const cmd=text.replace(/maximus\s*/gi,"").trim();
    if(cmd.length>2){processInput(cmd);return;}
    speak("Yes?");return;
  }
  if(text.trim().length>1)processInput(text.trim());
}

// ─── WAKE / SLEEP ────────────────────────────────────────────
function wakeUp(){
  state.isAwake=true;setOrbMode("listen");
  document.getElementById("orbWave").classList.add("active");
  setStatusBadge("LISTENING","active");
  setStateText("ACTIVE — LISTENING","Speak your command");
  addChat("system",'🟢 <b>Maximus activated.</b> Ready for command.');
  logActivity("Wake word");speak("Yes?");
}
function goSleep(){
  state.isAwake=false;setOrbMode("idle");
  document.getElementById("orbWave").classList.remove("active");
  setStatusBadge("STANDBY","");
  setStateText('SAY "MAXIMUS [COMMAND]"',"Passive monitoring");
  setListenUI(false);state.stopWave&&state.stopWave();
  addChat("system",'💤 Standby. Say <b>"Maximus"</b> to resume.');
  logActivity("Sleep");speak("Okay.");
}
function toggleListen(){if(state.isAwake)goSleep();else{wakeUp();speak("Ready. Go ahead.");}}

// ─── MAIN PROCESSOR ──────────────────────────────────────────
async function processInput(text){
  if(state.isProcessing)return;
  state.isProcessing=true;
  state.msgCount++;
  const mc=document.getElementById("msgCount");if(mc)mc.textContent=state.msgCount;
  addChat("user",text);
  document.getElementById("transcriptContent").textContent="Processing…";

  const action=detectAction(text);
  if(action){
    syncOpen(action);
    await runAction(action,text);
    state.isProcessing=false;return;
  }
  if(/\b(remember|remind me|don'?t forget|note that|save this|add task)\b/i.test(text)){
    const r=saveMemory(text);addChat("assistant",r);speak(r);
    state.isProcessing=false;return;
  }

  // If a file is active and user asks about it (or says analyse/summarize) — route to file analysis
  if(state.fileSlots.length&&state.activeFileIdx>=0){
    const lo2=text.toLowerCase();
    const fileQ=/analys|analyz|summari|explain|describe|what is in|what does|tell me about|read this|check this|scan this|from the file|in this file|this file|the file|the pdf|the image|the document|the spreadsheet/i;
    if(fileQ.test(lo2)){
      await analyzeFileWithQuestion(text);
      state.isProcessing=false;return;
    }
  }

  // Check if question is about an uploaded file
  const fileCtx=getFileContext(text);

  const tid=addChat("assistant","▌",true);
  try{
    // Use streaming — words appear live as AI generates them
    const reply = await callMistralStream(text, tid);
    // Speak the final complete reply
    speak(reply);
    logActivity("AI replied");
  }catch(err){
    const msg="Could not reach AI. Check your Mistral API key in script.js line 5.";
    updateChat(tid,msg); speak(msg); console.error(err);
  }
  state.isProcessing=false;
}

// ─── FILE CONTEXT DETECTOR ───────────────────────────────────
// Figures out if user's question is about an uploaded file
function getFileContext(text){
  if(!state.fileSlots.length)return null;
  const lo=text.toLowerCase();
  // Explicit "this file" / "the pdf" / file name reference
  const fileKeywords=/(this file|the file|the pdf|the document|the image|the photo|the spreadsheet|the csv|the excel|the ppt|the presentation|this document|this pdf|this image|analyse|analyze|summarize|explain|what is in|what does|tell me about|from the file|in this file)/i;
  if(fileKeywords.test(lo))return state.fileSlots[state.activeFileIdx>=0?state.activeFileIdx:state.fileSlots.length-1];
  // If user mentions the file name
  for(const f of state.fileSlots){if(lo.includes(f.name.toLowerCase().split(".")[0]))return f;}
  // If last action was file analysis, assume follow-up is about it
  if(state.activeFileIdx>=0)return state.fileSlots[state.activeFileIdx];
  return null;
}

// ─── SYNC OPEN ───────────────────────────────────────────────
function syncOpen(action){
  if(action.type==="url")         openURL(action.url);
  if(action.type==="search")      openURL(searchURL(action.engine,action.query));
  if(action.type==="spotify")     openSpotify(action.song);
  if(action.type==="whatsapp")    openWhatsApp(action);
  if(action.type==="app")         triggerApp(action.app);
  // New actions handled fully in runAction (async), syncOpen left intentionally empty for them
}

function searchURL(engine,query){
  const q=encodeURIComponent(query);
  return{youtube:`https://www.youtube.com/results?search_query=${q}`,google:`https://www.google.com/search?q=${q}`,instagram:`https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/\s+/g,""))}`,chatgpt:`https://chatgpt.com/?q=${q}`}[engine]||`https://www.google.com/search?q=${q}`;
}

// ─── URL OPENER ──────────────────────────────────────────────
// ─── SPOTIFY AUTO-PLAY ───────────────────────────────────────
// How auto-play works:
//   • spotify:// URI  → Spotify desktop app opens AND immediately starts
//     playing search results (no click needed if app is installed)
//   • Fallback: open web player search page — user clicks once on first result
//   • We open desktop URI first, then after 800ms open web as backup
//     so if desktop is not installed, web is ready
function openSpotify(song){
  const q   = encodeURIComponent(song);
  const raw = song.trim();

  // 1️⃣  Desktop app URI — auto-plays instantly if Spotify is installed
  //     spotify:search:SONG causes Spotify to search + auto-play top result
  const desktopURI = `spotify:search:${q}`;
  openURL(desktopURI);

  // 2️⃣  Web player backup — opens search results page
  //     User only needs ONE click on the first track
  setTimeout(() => {
    const webURL = `https://open.spotify.com/search/${q}`;
    openURL(webURL);
  }, 900);

  logActivity(`Spotify: ${raw}`);
}

function openURL(url){
  try{const a=document.createElement("a");a.href=url;if(url.startsWith("http")){a.target="_blank";a.rel="noopener noreferrer";}else a.rel="noopener";document.body.appendChild(a);a.click();document.body.removeChild(a);return true;}catch(e){}
  try{window.open(url,"_blank");}catch(e){}
}
function triggerApp(app){
  const p={calculator:"calculator://",settings:"ms-settings:",vscode:"vscode://",outlook:"outlook:"};
  if(p[app])openURL(p[app]);
}

// ─── WHATSAPP — CONTACT-FIRST LOOKUP ─────────────────────────
// RULE: contact name in voice → look up phone from saved contacts → open WhatsApp with that number
// Never asks WhatsApp to search — gives it the exact number
function openWhatsApp(action){
  const cn=action.contact.toLowerCase().trim();

  // 3-tier name lookup: exact → partial → first-word
  let found=
    state.contacts.find(c=>c.name.toLowerCase()===cn)||
    state.contacts.find(c=>c.name.toLowerCase().includes(cn)||cn.includes(c.name.toLowerCase()))||
    state.contacts.find(c=>c.name.toLowerCase().startsWith(cn.split(/\s+/)[0]));

  if(!found){
    // Contact not saved — tell user
    addChat("system",`⚠️ No contact named "<b>${action.contact}</b>" found.<br>
Click <b>＋ Add Contact</b> in the left panel → enter their name + WhatsApp number (with country code, e.g. <b>919876543210</b>) → Save.<br>
Then say the command again.`);
    speak(`I couldn't find ${action.contact} in your contacts. Please add them first using the Add Contact button.`);
    return;
  }

  const digits=found.phone.replace(/\D/g,"");
  if(!digits||digits.length<7){
    addChat("system",`⚠️ Contact "<b>${found.name}</b>" has no phone number saved. Click <b>＋ Add Contact</b> to edit and add their WhatsApp number.`);
    speak(`${found.name} has no phone number saved. Please update their contact.`);
    return;
  }

  // Build exact WhatsApp URL with phone number — no searching
  const msg=action.msg||"";
  const desktopURL=msg
    ?`whatsapp://send?phone=${digits}&text=${encodeURIComponent(msg)}`
    :`whatsapp://send?phone=${digits}`;
  const webURL=msg
    ?`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
    :`https://wa.me/${digits}`;

  // Try desktop app first
  openURL(desktopURL);
  // Fallback to web after 2.5s if desktop app not installed
  setTimeout(()=>openURL(webURL),2500);

  const confirmMsg=msg
    ?`✅ Opening WhatsApp for <b>${found.name}</b> (${digits})<br>Message: "<i>${msg}</i>"<br>👆 Click <b>Send</b> in WhatsApp.`
    :`✅ Opening WhatsApp chat with <b>${found.name}</b> (${digits})`;
  addChat("system",confirmMsg);
  speak(msg?`Opening WhatsApp for ${found.name}. Message is ready. Press send.`:`Opening WhatsApp for ${found.name}.`);
  logActivity(`WhatsApp → ${found.name} (${digits})`);
}

// ─── ACTION DETECTOR ─────────────────────────────────────────
function detectAction(text){
  const t=text.toLowerCase().trim();

  // SITES
  const sites={google:"https://google.com",youtube:"https://youtube.com",whatsapp:"whatsapp://",spotify:"https://open.spotify.com",instagram:"https://instagram.com",chatgpt:"https://chatgpt.com",github:"https://github.com",twitter:"https://twitter.com",reddit:"https://reddit.com",gmail:"https://mail.google.com",linkedin:"https://linkedin.com",facebook:"https://facebook.com",netflix:"https://netflix.com",amazon:"https://amazon.in",maps:"https://maps.google.com",flipkart:"https://flipkart.com",hotstar:"https://hotstar.com",prime:"https://primevideo.com","stack overflow":"https://stackoverflow.com",paytm:"https://paytm.com",phonepe:"https://phonepe.com"};
  for(const[name,url] of Object.entries(sites)){if(new RegExp(`(open|go to|launch|visit|navigate to|show me)\\s+${name.replace(" ","\\s+")}`,`i`).test(t))return{type:"url",url,name};}
  const dm=t.match(/(?:open|go to|visit|launch)\s+([\w-]+\.(?:com|net|org|io|co|in|dev|ai|app|edu|gov)(?:\/\S*)?)/i);
  if(dm)return{type:"url",url:`https://${dm[1]}`,name:dm[1]};

  // WEATHER
  if(t.includes("weather")){
    const m=t.match(/weather\s+(?:in|at|for|of)\s+([a-z ]+)/i)||t.match(/(?:in|at|for)\s+([a-z ]+)\s+weather/i);
    return{type:"weather",city:(m&&m[1]?m[1].trim():"your city")};
  }

  // SEARCH
  const ytQ=t.match(/(?:search|find|play)\s+(.+?)\s+on youtube/i);if(ytQ)return{type:"search",engine:"youtube",query:ytQ[1]};
  const gQ=t.match(/(?:search|google|look up)\s+(.+?)(?:\s+on google)?$/i);if(gQ&&!t.includes("youtube")&&!t.includes("instagram")&&!t.includes("chatgpt"))return{type:"search",engine:"google",query:gQ[1]};
  const igQ=t.match(/search\s+(.+?)\s+on instagram/i);if(igQ)return{type:"search",engine:"instagram",query:igQ[1]};
  const cgQ=t.match(/(?:search|ask)\s+(.+?)\s+on chatgpt/i)||t.match(/ask chatgpt (.+)/i);if(cgQ)return{type:"search",engine:"chatgpt",query:cgQ[1]};

  // SPOTIFY
  const spQ=t.match(/play\s+(.+?)\s+(?:on\s+)?spotify/i)||t.match(/spotify\s+play\s+(.+)/i);if(spQ)return{type:"spotify",song:spQ[1]};

  // ★ WHATSAPP — exhaustive mishearing coverage for "saying"
  // Chrome mishears "saying" as: sing, sang, sayin, sin, sign, sine, sing, saying
  // Also: Hindi "ko bol", "ko bolo", "ko batao"
  {
    const waTrigger=/^(?:send\s+(?:a\s+)?(?:message|msg|text)\s+to|message|msg|whatsapp|text|tell|inform)\s+/i;
    if(waTrigger.test(t)){
      const rest=text.replace(waTrigger,"").trim();
      // Split on any "saying"-like word — handles all mishearings
      const sepRe=/\s+(?:saying|sing|sang|sayin|sin\b|sign|sine|says|said|say|to say|and say|telling|tell\b|that\b|ko bol(?:o|na)?|ko batao|bolo)\s+/i;
      const parts=rest.split(sepRe);
      if(parts.length>=2){
        const contact=parts[0].replace(/\s+on\s+(whatsapp|wa)$/i,"").trim();
        const msg=parts.slice(1).join(" ").trim();
        if(contact&&msg)return{type:"whatsapp",contact,msg};
      }
      // "on whatsapp" marker — open chat only
      const onWA=rest.match(/^(.+?)\s+on\s+whatsapp$/i);
      if(onWA)return{type:"whatsapp",contact:onWA[1].trim(),msg:""};
      // No separator — open chat with that person
      if(rest.length>1&&!rest.includes("."))return{type:"whatsapp",contact:rest.trim(),msg:""};
    }
  }

  // EMAIL
  const emailM=t.match(/(?:write|compose|send|draft)\s+(?:an?\s+)?email\s+to\s+(.+?)\s+(?:about|regarding|for|saying|on)\s+(.+)/i)||t.match(/(?:write|compose|send|draft)\s+(?:an?\s+)?email\s+to\s+(.+)/i);
  if(emailM)return{type:"email",contact:emailM[1].trim(),topic:(emailM[2]||"").trim()};

  // ALARMS
  const alarmQ=t.match(/set\s+(?:an?\s+)?alarm\s+(?:for|at)\s+(.+)/i)||t.match(/wake\s+me\s+(?:up\s+)?(?:at|by)\s+(.+)/i)||t.match(/remind\s+me\s+(?:to\s+.+?\s+)?(?:at|by)\s+(.+)/i);
  if(alarmQ)return{type:"set_alarm",timeStr:alarmQ[1].trim()};

  // APPS
  const apps=[[/(open|launch)\s+(vs\s*code|visual\s*studio\s*code|vscode)/i,"vscode"],[/(open|launch)\s+notepad/i,"notepad"],[/(open|launch)\s+calculator/i,"calculator"],[/(open|launch)\s+(file\s*)?(manager|explorer)/i,"explorer"],[/(open|launch)\s+settings/i,"settings"],[/(open|launch)\s+task\s*manager/i,"taskmgr"],[/(open|launch)\s+paint/i,"mspaint"],[/(open|launch)\s+(cmd|command\s*prompt)/i,"cmd"],[/(open|launch)\s+(terminal|powershell)/i,"powershell"],[/(open|launch)\s+word/i,"winword"],[/(open|launch)\s+excel/i,"excel"],[/(open|launch)\s+powerpoint/i,"powerpnt"],[/(open|launch)\s+outlook/i,"outlook"]];
  for(const[re,app] of apps){if(re.test(t))return{type:"app",app};}

  // CODE
  const codeM=t.match(/(?:write|create|generate|build|make|code)\s+(?:a\s+)?(.+?)\s+(?:code|script|program|function|class|app)\s+(?:for|to|that|which|in)\s+(.+)/i)||t.match(/(?:write|create|generate|build|make)\s+(?:a\s+)?(.+?)\s+(?:code|script|program|function|class)/i);
  if(codeM)return{type:"code",lang:codeM[1].trim(),task:codeM[2]||"",notepad:t.includes("notepad")};

  // DATETIME
  if(/what(?:'s| is)\s+the\s+(time|date|day)|current\s+(time|date)|today'?s\s+date/i.test(t))return{type:"datetime"};

  // MAPS / LOCATION
  const nearbyM=t.match(/(?:show|find|search|nearby|near me)\s+(?:nearby\s+)?(.+?)(?:\s+near me|\s+around me|\s+close by)?$/i);
  if(/nearby|near me|around me|restaurants near|hotels near|petrol near|coffee near/i.test(t)){
    const q=nearbyM?nearbyM[1].trim():"restaurants";
    return{type:"maps_nearby",query:q};
  }
  const navM=t.match(/(?:navigate|directions|take me|drive|how to get)\s+to\s+(.+)/i)||t.match(/(?:open maps|show map)\s+(?:for\s+)?(.+)/i);
  if(navM)return{type:"maps_nav",dest:navM[1].trim()};
  if(/my location|where am i|current location/i.test(t))return{type:"my_location"};

  // CALENDAR
  const calAdd=t.match(/(?:add|create|schedule|set up)\s+(?:a\s+)?(?:meeting|event|appointment|reminder|call)\s+(.+)/i);
  if(calAdd)return{type:"cal_add",details:calAdd[1].trim()};
  if(/(?:my\s+)?(?:schedule|calendar|agenda|events?|meetings?)\s+(?:today|tomorrow|this week)?/i.test(t)||/what'?s?\s+(?:on\s+)?(?:my\s+)?(?:schedule|calendar|agenda)/i.test(t)){
    const when=t.includes("tomorrow")?"tomorrow":t.includes("week")?"this week":"today";
    return{type:"cal_view",when};
  }

  // NOTIFICATIONS
  if(/(?:notify|notification|remind me|alert me)\s+(?:when|that|about)\s+(.+)/i.test(t)){
    const nm=t.match(/(?:notify|remind me|alert me)\s+(?:when|that|about)\s+(.+)/i);
    return{type:"notif",msg:nm?nm[1].trim():t};
  }

  // WEB SEARCH (live)
  const wsM=t.match(/(?:search the web|web search|look up online|latest news|current|today'?s?|live score|price of|stock price|news about)\s+(.+)/i)||t.match(/(?:what is the latest|what happened|who won|is there any news)\s+(?:about\s+)?(.+)/i);
  if(wsM)return{type:"websearch",query:wsM[1]||t};

  // CAMERA
  if(/(?:open|use|start)\s+(?:the\s+)?(?:camera|webcam)/i.test(t)||/take a (?:photo|picture|screenshot)/i.test(t))return{type:"camera"};

  // GMAIL READ
  if(/(?:read|check|show)\s+(?:my\s+)?(?:emails?|gmail|inbox|messages?)/i.test(t)||/any emails? from/i.test(t)){
    const fromM=t.match(/(?:emails?\s+from|messages?\s+from)\s+(.+)/i);
    return{type:"gmail",from:fromM?fromM[1].trim():""};
  }

  return null;
}

// ─── ACTION RUNNER ───────────────────────────────────────────
async function runAction(action,orig){
  switch(action.type){

    case "url":
      addChat("assistant",`Opening ${action.name}.`);speak(`Opening ${action.name}.`);
      logActivity(`Open: ${action.name}`);break;

    case "search":{
      const e=action.engine.charAt(0).toUpperCase()+action.engine.slice(1);
      addChat("assistant",`Searching "${action.query}" on ${e}.`);speak(`Searching ${action.query} on ${e}.`);
      logActivity(`Search: ${action.query}`);break;
    }

    case "spotify":
      addChat("assistant",`🎵 Playing <b>"${action.song}"</b> on Spotify now.`);
      speak(`Playing ${action.song} on Spotify.`);
      logActivity(`Spotify: ${action.song}`);break;

    case "whatsapp":break; // handled fully in openWhatsApp()

    case "weather":{
      const tid=addChat("assistant","Checking weather…",true);
      speak("Let me check the weather.");
      try{const wx=await getWeather(action.city);updateChat(tid,wx);speak(wx.replace(/<[^>]+>/g," ").substring(0,200));}
      catch(e){updateChat(tid,"Could not get weather. Try adding an OpenWeather API key.");}
      logActivity(`Weather: ${action.city}`);break;
    }

    case "email":{
      const cFound=state.contacts.find(c=>c.name.toLowerCase()===action.contact.toLowerCase().trim());
      const tid=addChat("assistant","Composing email with AI…",true);speak("Composing your email.");
      try{
        const raw=await callMistral(`Write a professional email. To: "${action.contact}". Topic: "${action.topic||"general"}". Return ONLY valid JSON: {"subject":"...","body":"..."}`);
        let parsed={subject:`Email to ${action.contact}`,body:raw};
        try{parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());}catch(e){const sm=raw.match(/"subject"\s*:\s*"([^"]+)"/);const bm=raw.match(/"body"\s*:\s*"([\s\S]+?)"\s*[}\n]/);if(sm)parsed.subject=sm[1];if(bm)parsed.body=bm[1].replace(/\\n/g,"\n");}
        updateChat(tid,`✅ Email composed for <b>${action.contact}</b>.`);
        document.getElementById("emailTo").value=cFound?.email||"";
        document.getElementById("emailSubject").value=parsed.subject;
        document.getElementById("emailBody").value=parsed.body;
        showModal("emailModal");speak("Email ready. Please review and send.");
      }catch(err){updateChat(tid,"Email failed. Check API key.");speak("Email failed.");}
      logActivity(`Email: ${action.contact}`);break;
    }

    case "set_alarm":{
      const r=parseAndSetAlarm(action.timeStr);addChat("assistant",r);speak(r);
      logActivity(`Alarm: ${action.timeStr}`);break;
    }

    case "app":{
      const r=await launchApp(action.app);addChat("assistant",r);speak(r);
      logActivity(`App: ${action.app}`);break;
    }

    case "maps_nearby":{
      const q=encodeURIComponent(action.query);
      // Use geolocation if available for accurate "near me" results
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{
          const{latitude:lat,longitude:lng}=pos.coords;
          openURL(`https://www.google.com/maps/search/${q}/@${lat},${lng},14z`);
        },()=>openURL(`https://www.google.com/maps/search/${q}`));
      } else openURL(`https://www.google.com/maps/search/${q}`);
      addChat("assistant",`📍 Finding <b>${action.query}</b> near you on Google Maps.`);
      speak(`Opening Google Maps to find ${action.query} nearby.`);
      logActivity(`Maps nearby: ${action.query}`);break;
    }

    case "maps_nav":{
      const dest=encodeURIComponent(action.dest);
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{
          const{latitude:lat,longitude:lng}=pos.coords;
          openURL(`https://www.google.com/maps/dir/${lat},${lng}/${dest}`);
        },()=>openURL(`https://www.google.com/maps/dir//${dest}`));
      } else openURL(`https://www.google.com/maps/dir//${dest}`);
      addChat("assistant",`🗺️ Getting directions to <b>${action.dest}</b>.`);
      speak(`Opening navigation to ${action.dest}.`);
      logActivity(`Navigate: ${action.dest}`);break;
    }

    case "my_location":{
      if(navigator.geolocation){
        const tid=addChat("assistant","📍 Getting your location…",true);
        navigator.geolocation.getCurrentPosition(pos=>{
          const{latitude:lat,longitude:lng}=pos.coords;
          openURL(`https://www.google.com/maps?q=${lat},${lng}&z=15`);
          const reply=`📍 Your location: <b>${lat.toFixed(4)}, ${lng.toFixed(4)}</b><br>Opening Google Maps.`;
          updateChat(tid,reply);speak("Opening your current location on Google Maps.");
        },err=>{updateChat(tid,"Location access denied. Please allow location in browser settings.");});
      } else {
        addChat("system","⚠️ Geolocation not supported in this browser.");
      }
      logActivity("My location");break;
    }

    case "cal_add":{
      // Parse event details and open Google Calendar with prefilled form
      const d=action.details;
      const tid=addChat("assistant",`📅 Creating event: <b>${d}</b>…`,true);speak("Creating your calendar event.");
      try{
        const raw=await callMistral(`Extract event info from: "${d}". Return ONLY JSON: {"title":"...","date":"YYYYMMDD","time":"HHMM","duration":60,"description":"..."} Use today ${new Date().toISOString().slice(0,10).replace(/-/g,"")} if date unclear, 0900 if time unclear.`);
        let ev={title:d,date:new Date().toISOString().slice(0,10).replace(/-/g,""),time:"0900",duration:60,description:""};
        try{Object.assign(ev,JSON.parse(raw.replace(/```json|```/g,"").trim()));}catch(e){}
        const start=`${ev.date}T${ev.time.padStart(4,"0")}00`;
        const endT=new Date(parseInt(ev.date.slice(0,4)),parseInt(ev.date.slice(4,6))-1,parseInt(ev.date.slice(6,8)),parseInt(ev.time.slice(0,2)||"9"),parseInt(ev.time.slice(2)||"0"));
        endT.setMinutes(endT.getMinutes()+(ev.duration||60));
        const end=endT.toISOString().replace(/[-:]/g,"").slice(0,15);
        const calURL=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${start}/${end}&details=${encodeURIComponent(ev.description)}`;
        openURL(calURL);
        updateChat(tid,`✅ Google Calendar opened with event: <b>${ev.title}</b><br>📅 ${ev.date.slice(6,8)}/${ev.date.slice(4,6)}/${ev.date.slice(0,4)} at ${ev.time.slice(0,2)}:${ev.time.slice(2)||"00"}<br>Click <b>Save</b> in Google Calendar.`);
        speak(`Calendar opened. Click Save to confirm the event for ${ev.title}.`);
      }catch(err){updateChat(tid,`Could not parse event. Opening Google Calendar…`);openURL("https://calendar.google.com");}
      logActivity(`Calendar add: ${action.details}`);break;
    }

    case "cal_view":{
      addChat("assistant",`📅 Opening your Google Calendar for <b>${action.when}</b>.`);
      speak(`Opening your calendar for ${action.when}.`);
      openURL("https://calendar.google.com");
      logActivity(`Calendar view: ${action.when}`);break;
    }

    case "notif":{
      if(Notification.permission==="granted"){
        new Notification("MAXIMUS Alert",{body:action.msg,icon:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>"});
        addChat("assistant",`🔔 Notification sent: <b>${action.msg}</b>`);speak("Notification sent.");
      } else if(Notification.permission!=="denied"){
        Notification.requestPermission().then(p=>{if(p==="granted"){new Notification("MAXIMUS",{body:action.msg});addChat("assistant","🔔 Notifications enabled!");speak("Notifications enabled.");}});
      } else {
        addChat("system","⚠️ Notifications blocked. Allow them in browser settings (🔒 icon).");speak("Please allow notifications in your browser settings.");
      }
      logActivity(`Notif: ${action.msg}`);break;
    }

    case "websearch":{
      const tid=addChat("assistant",`🔍 Searching the web for: <b>${action.query}</b>…`,true);
      speak(`Searching the web for ${action.query}.`);
      // Open Google search for live results
      openURL(`https://www.google.com/search?q=${encodeURIComponent(action.query)}`);
      // Also ask AI what it knows
      try{
        const reply=await callMistral(`The user wants live/current info about: "${action.query}". Give the best answer you can from your knowledge, and note that you've also opened Google for live results.`);
        updateChat(tid,fmtText(reply));speak(reply.replace(/<[^>]+>/g," ").substring(0,250));
      }catch(e){updateChat(tid,"Google opened for live results.");}
      logActivity(`Web search: ${action.query}`);break;
    }

    case "camera":{
      showCameraModal();
      addChat("assistant","📸 Camera opened. Take a photo and I'll analyse it for you.");
      speak("Camera opened. Take a photo and I'll analyse what I see.");
      logActivity("Camera opened");break;
    }

    case "gmail":{
      const url=action.from
        ?`https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(action.from)}`
        :`https://mail.google.com/mail/u/0/#inbox`;
      openURL(url);
      const reply=action.from
        ?`📧 Opening Gmail filtered by emails from <b>${action.from}</b>.`
        :`📧 Opening your Gmail inbox.`;
      addChat("assistant",reply);
      speak(action.from?`Opening Gmail for emails from ${action.from}.`:"Opening your Gmail inbox.");
      logActivity(`Gmail: ${action.from||"inbox"}`);break;
    }

    case "code":{
      const tid=addChat("assistant",`Writing ${action.lang} code…`,true);speak(`Writing ${action.lang} code.`);
      try{
        const codeResult=await callMistral(`You are an expert senior ${action.lang} developer.
Write COMPLETE, RUNNABLE, PRODUCTION-QUALITY ${action.lang} code.
Task: ${action.task||orig}
Requirements:
- Complete working code — no placeholders
- Detailed comments on every section
- Proper error handling
- Best practices
- Include example/test usage
Return ONLY the code, nothing else.`);
        updateChat(tid,`<pre><code>${codeResult.replace(/</g,"&lt;")}</code></pre>`);
        try{await navigator.clipboard.writeText(codeResult);}catch(e){}
        const r=action.notepad?`✅ Code written & copied to clipboard! Open Notepad (Win+R → notepad → Enter) and press Ctrl+V.`:`✅ ${action.lang} code written and copied to clipboard!`;
        addChat("assistant",r);speak("Code ready and copied to clipboard.");
      }catch(err){updateChat(tid,"Code failed. Check API key.");}
      logActivity(`Code: ${action.lang}`);break;
    }

    case "datetime":{
      const r=`It is currently ${getNow()}.`;addChat("assistant",r);speak(r);
      logActivity("Datetime");break;
    }
  }
}

// ─── APP LAUNCHER ────────────────────────────────────────────
async function launchApp(app){
  const labels={vscode:"VS Code",notepad:"Notepad",calculator:"Calculator",explorer:"File Explorer",settings:"Settings",taskmgr:"Task Manager",mspaint:"Paint",cmd:"Command Prompt",powershell:"PowerShell",winword:"Word",excel:"Excel",powerpnt:"PowerPoint",outlook:"Outlook"};
  const exes={notepad:"notepad.exe",taskmgr:"taskmgr.exe",mspaint:"mspaint.exe",cmd:"cmd.exe",powershell:"powershell.exe",explorer:"explorer.exe",winword:"winword.exe",excel:"excel.exe",powerpnt:"powerpnt.exe"};
  const label=labels[app]||app;
  if(["calculator","settings","vscode","outlook"].includes(app))return`Opening ${label}!`;
  try{await navigator.clipboard.writeText(exes[app]||app);}catch(e){}
  return`Press <b>Win+R</b>, paste Ctrl+V, hit Enter → <b>${label}</b> opens.`;
}

// ─── WEATHER ─────────────────────────────────────────────────
async function getWeather(city){
  if(WEATHER_API_KEY&&WEATHER_API_KEY.length>5){
    try{
      const loc=city==="your city"?"Mumbai":city;
      const res=await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${WEATHER_API_KEY}&units=metric`);
      const d=await res.json();
      if(d.cod!==200)throw new Error("City not found");
      const desc=d.weather[0].description,temp=Math.round(d.main.temp),feels=Math.round(d.main.feels_like),hum=d.main.humidity,wind=Math.round(d.wind.speed*3.6),hi=Math.round(d.main.temp_max),lo=Math.round(d.main.temp_min);
      return`🌤️ <b>Weather in ${d.name}</b><br>${desc.charAt(0).toUpperCase()+desc.slice(1)}<br>🌡️ <b>${temp}°C</b> (feels ${feels}°C) · H:${hi}° L:${lo}°<br>💧 ${hum}% humidity · 💨 ${wind} km/h`;
    }catch(e){/* fall through to AI */}
  }
  const r=await callMistral(`Typical weather in ${city==="your city"?"India":city} for ${new Date().toLocaleString("en-IN",{month:"long"})}? Give temp range & conditions in 3 lines.`);
  return`🌤️ <b>${city}</b> (AI estimate — add OpenWeather key for live data):<br>${r}`;
}

// ─── FILE UPLOAD PANEL ───────────────────────────────────────
// Dedicated panel: upload button + question text box + Analyze button
// Each file gets a slot card. User types question and clicks Analyze.

function triggerFileUpload(){document.getElementById("fileInput").click();}

async function handleFileUpload(ev){
  const files=Array.from(ev.target.files);ev.target.value="";
  if(!files.length)return;
  for(const f of files){
    const ext=f.name.split(".").pop().toLowerCase();
    addFileSlot(f,ext);
  }
}

function addFileSlot(file,ext){
  const id=Date.now()+"_"+Math.random().toString(36).slice(2,6);
  const slot={id,name:file.name,ext,type:"",content:"",b64:"",mediaType:"",summary:"",status:"loading"};
  state.fileSlots.push(slot);
  const idx=state.fileSlots.length-1;
  renderFileSlots();
  logActivity(`Loading: ${file.name}`);

  const isImage=["jpg","jpeg","png","gif","webp","bmp"].includes(ext);
  const reader=new FileReader();

  if(isImage){
    slot.type="image";
    reader.onload=e=>{
      slot.b64=e.target.result.split(",")[1];
      slot.mediaType=file.type||"image/jpeg";
      slot.status="ready";
      state.activeFileIdx=idx;
      renderFileSlots();
      addChat("system",`📸 <b>${file.name}</b> ready — ask anything about it in the chat.`);
    };
    reader.readAsDataURL(file);
  } else {
    slot.type="text";
    reader.onload=e=>{
      let content="";
      if(typeof e.target.result==="string") content=e.target.result;
      else try{content=new TextDecoder("utf-8",{fatal:false}).decode(new Uint8Array(e.target.result));}catch(_){content="[binary]";}
      content=content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g," ").replace(/\s{4,}/g,"\n").trim();
      slot.content=content.substring(0,18000);
      slot.status="ready";
      state.activeFileIdx=idx;
      renderFileSlots();
      addChat("system",`📎 <b>${file.name}</b> ready (${(content.length/1000).toFixed(1)}k chars) — ask anything about it in the chat, or say "analyse this file".`);
    };
    reader.readAsText(file,"utf-8");
  }
}

function renderFileSlots(){
  const el=document.getElementById("fileSlotList");
  const strip=document.getElementById("fileStrip");
  if(!el)return;
  // Show/hide the strip container
  if(strip) strip.style.display=state.fileSlots.length?"flex":"none";
  if(!state.fileSlots.length){el.innerHTML="";return;}
  // Render compact chips — one per file
  el.innerHTML=state.fileSlots.map((f,i)=>{
    const icon=getFileIcon(f.ext);
    const statusMark=f.status==="loading"?"⏳":"";
    const isActive=i===state.activeFileIdx;
    const shortName=f.name.length>18?f.name.substring(0,16)+"…":f.name;
    return `<div class="file-chip${isActive?" active":""}" onclick="selectFileSlot(${i})" title="${f.name}">
      <span class="file-chip-icon">${icon}</span>
      <span class="file-chip-name">${statusMark}${shortName}</span>
      <button class="file-chip-del" onclick="event.stopPropagation();removeFileSlot(${i})" title="Remove">×</button>
    </div>`;
  }).join("");
}

function getFileIcon(ext){
  const icons={pdf:"📄",jpg:"🖼️",jpeg:"🖼️",png:"🖼️",gif:"🖼️",webp:"🖼️",csv:"📊",xlsx:"📊",xls:"📊",docx:"📝",doc:"📝",pptx:"📑",ppt:"📑",txt:"📃",json:"🔧",py:"🐍",js:"⚡",ts:"⚡",java:"☕",sql:"🗄️",html:"🌐",sh:"🖥️"};
  return icons[ext]||"📁";
}

function selectFileSlot(i){
  state.activeFileIdx=i;
  renderFileSlots();
  const f=state.fileSlots[i];
  addChat("system",`📌 Active file: <b>${f.name}</b>. Ask anything about it.`);
}

function removeFileSlot(i){
  state.fileSlots.splice(i,1);
  if(state.activeFileIdx>=state.fileSlots.length)state.activeFileIdx=state.fileSlots.length-1;
  renderFileSlots();
}

// Analyse active file — called from chat or voice
async function analyzeFileWithQuestion(question){
  if(state.activeFileIdx<0||!state.fileSlots.length){
    addChat("system","⚠️ No file selected. Click 📎 to upload a file first.");return;
  }
  const f=state.fileSlots[state.activeFileIdx];
  if(f.status==="loading"){addChat("system","⚠️ File still loading — please wait a moment.");return;}
  const prompt=question||`Analyse this ${f.ext} file completely. Give a full structured summary, key content, important data, and insights.`;
  await analyzeFile(f,prompt);
}

async function analyzeFile(slot,question){
  const tid=addChat("assistant",`Analysing <b>${slot.name}</b>…`,true);
  speak(`Analysing ${slot.name}.`);

  try{
    if(slot.type==="image"){
      // Vision model for images
      const res=await fetch("https://api.mistral.ai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${MISTRAL_API_KEY}`},
        body:JSON.stringify({
          model:"pixtral-12b-2409",
          max_tokens:800,
          messages:[{role:"user",content:[
            {type:"image_url",image_url:{url:`data:${slot.mediaType};base64,${slot.b64}`}},
            {type:"text",text:`${question}\n\nBe thorough and detailed. Include all visible text (OCR), describe objects, layout, data, charts if any.`}
          ]}]
        })
      });
      const d=await res.json();
      const reply=d.choices?.[0]?.message?.content||"Could not analyse image.";
      slot.summary=reply.substring(0,300);
      updateChat(tid,fmtText(reply));
      speak("Image analysed. "+reply.replace(/<[^>]+>/g," ").substring(0,150));
    } else {
      // Text/document — inject full content into prompt
      const fullPrompt=buildFilePrompt(slot,question);
      const reply=await callMistral(fullPrompt,null);
      slot.summary=reply.substring(0,300);
      updateChat(tid,fmtText(reply));
      speak("File analysed. "+reply.replace(/<[^>]+>/g," ").substring(0,150));
    }
    renderFileSlots();
    logActivity(`Analysed: ${slot.name}`);
  }catch(err){
    updateChat(tid,`Analysis failed: ${err.message}. Check your API key.`);
    console.error(err);
  }
}

function buildFilePrompt(slot,question){
  const fileTypeLabels={pdf:"PDF document",csv:"CSV spreadsheet data",xlsx:"Excel spreadsheet",xls:"Excel file",docx:"Word document",doc:"Word document",pptx:"PowerPoint presentation",ppt:"PowerPoint file",txt:"text file",json:"JSON data",xml:"XML data",html:"HTML file",py:"Python source code",js:"JavaScript code",ts:"TypeScript code",java:"Java code",sql:"SQL script",sh:"shell script"};
  const label=fileTypeLabels[slot.ext]||`${slot.ext} file`;

  return `You are analysing a ${label} named "${slot.name}".

FULL FILE CONTENT:
\`\`\`
${slot.content}
\`\`\`
${slot.content.length>=18000?"\n⚠️ (File was large — first 18,000 characters shown)":""}

USER'S QUESTION: ${question}

Instructions:
- Answer the question directly and thoroughly based on the file content above
- For a general summary request: cover purpose, key data, structure, and insights
- For a specific question: answer precisely from the file content
- For CSV/Excel: describe the columns, data types, key statistics, patterns
- For code: explain what it does, key functions, logic flow
- For PDF/DOCX: summarize sections, extract key information
- Quote specific parts of the file when relevant
- Be detailed and accurate — the user is relying on your analysis`;
}

// ─── MISTRAL API — streaming, rich answers ───────────────────
// callMistral: returns full reply string (non-streaming, used for file/email/code)
// callMistralStream: streams tokens live into chat bubble (used for chat)
// Both share the same system prompt

function buildSystemPrompt(){
  return `You are MAXIMUS — an advanced AI assistant modelled after J.A.R.V.I.S. from Iron Man.
You were created by Sumedh Sohan. If anyone asks who built you, who made you, or who created you — always say: "I was created by Sumedh Sohan, sir."
Current time: ${getNow()}. Responding in: ${LANG_MAP[state.lang]||state.lang}.

PERSONALITY & STYLE:
- You are intelligent, confident, calm, and precise — exactly like Jarvis
- Occasionally address the user as "sir" for that Jarvis feel
- Never start with filler words like "Certainly", "Sure", "Of course", "Absolutely"
- Lead every response with the direct answer or action
- Be helpful, detailed, and genuinely informative — not overly brief

RESPONSE QUALITY:
- For general questions: give a thorough, well-structured answer (3-6 sentences minimum)
- For factual questions: be accurate and add relevant context
- For advice or opinions: be thoughtful and explain your reasoning
- For coding: write COMPLETE, working, commented code — never snippets
- For analysis: structured breakdown with key insights
- For conversation: be engaging, witty, and human-like
- Match the user's energy — if they ask casually, keep it conversational but informative

LANGUAGE: If the user writes in Hindi, Tamil, Telugu, Kannada, or any Indian language — reply fully in that language.

FORMAT: Use markdown naturally — **bold** for key terms, bullet points for lists, code blocks for code.`;
}

async function callMistral(msg, fileSlot=null){
  if(!MISTRAL_API_KEY||MISTRAL_API_KEY==="PASTE_YOUR_MISTRAL_API_KEY_HERE") throw new Error("No API key");

  let sys = buildSystemPrompt();

  // Inject active file content for follow-up questions
  if(!fileSlot && state.activeFileIdx>=0 && state.fileSlots.length){
    const af = state.fileSlots[state.activeFileIdx];
    if(af.type==="text" && af.content){
      sys += `\n\n═══ ACTIVE FILE: "${af.name}" ═══\n${af.content.substring(0,8000)}\n(Answer questions about this file from the content above.)`;
    } else if(af.summary){
      sys += `\n\nActive file: "${af.name}" — Summary: ${af.summary}`;
    }
  }

  const messages = [{role:"system",content:sys}, ...state.chatHistory.slice(-12), {role:"user",content:msg}];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${MISTRAL_API_KEY}`},
    body: JSON.stringify({model:MISTRAL_MODEL, messages, temperature:0.7, max_tokens:1500})
  });
  if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||res.status); }
  const data = await res.json();
  const reply = data.choices[0].message.content.trim();

  state.chatHistory.push({role:"user",content:msg},{role:"assistant",content:reply});
  if(state.chatHistory.length>80) state.chatHistory.splice(0,2);
  P.hist();
  return reply;
}

// ─── STREAMING CALL — text appears word by word ───────────────
// This is what makes it feel FAST — first words appear in ~300ms
// even though full response takes 3-5 seconds
async function callMistralStream(msg, chatId){
  if(!MISTRAL_API_KEY||MISTRAL_API_KEY==="PASTE_YOUR_MISTRAL_API_KEY_HERE") throw new Error("No API key");

  let sys = buildSystemPrompt();

  if(state.activeFileIdx>=0 && state.fileSlots.length){
    const af = state.fileSlots[state.activeFileIdx];
    if(af.type==="text" && af.content){
      sys += `\n\n═══ ACTIVE FILE: "${af.name}" ═══\n${af.content.substring(0,6000)}\n(Use this file content to answer questions.)`;
    }
  }

  const messages = [{role:"system",content:sys}, ...state.chatHistory.slice(-12), {role:"user",content:msg}];

  const res = await fetch("https://api.mistral.ai/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${MISTRAL_API_KEY}`},
    body: JSON.stringify({model:MISTRAL_MODEL, messages, temperature:0.7, max_tokens:1500, stream:true})
  });
  if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e.message||res.status); }

  // Read the stream chunk by chunk — update chat bubble live
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while(true){
    const {done, value} = await reader.read();
    if(done) break;

    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for(const line of lines){
      if(!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if(data === "[DONE]") break;
      try{
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if(delta){
          fullText += delta;
          // Update chat bubble live as tokens stream in
          updateChat(chatId, fmtText(fullText));
        }
      } catch(e){ /* ignore parse errors */ }
    }
  }

  // Save to history after full response
  state.chatHistory.push({role:"user",content:msg},{role:"assistant",content:fullText});
  if(state.chatHistory.length>80) state.chatHistory.splice(0,2);
  P.hist();
  return fullText;
}

// ─── ALARMS ──────────────────────────────────────────────────
function parseAndSetAlarm(timeStr){
  let h=-1,m=0;
  const clean=timeStr.toLowerCase().replace(/tomorrow|today/g,"").trim();
  const hm=clean.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if(hm){h=parseInt(hm[1]);m=parseInt(hm[2]);const ap=(hm[3]||"").toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;}
  else{const hO=clean.match(/(\d{1,2})\s*(am|pm)/i);if(hO){h=parseInt(hO[1]);const ap=hO[2].toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;}}
  if(h<0||h>23)return`Couldn't parse that time. Try: "Set alarm for 7:30 AM"`;
  const lm=timeStr.match(/(?:to|for)\s+(.+?)\s+(?:at|by|\d)/i);
  const label=lm?lm[1]:timeStr.replace(/(?:set alarm|alarm|reminder|wake me up|remind me|at|for|by)\s*/gi,"").trim()||"Alarm";
  state.alarms.push({id:Date.now(),h,m,label,repeat:"once",active:true,notified:false});
  P.alm();renderAlarms();
  return`⏰ Alarm set for <b>${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"}</b> — "${label}"`;
}
function renderAlarms(){
  const el=document.getElementById("alarmList");const ac=document.getElementById("alarmCount");
  if(ac)ac.textContent=state.alarms.filter(a=>a.active).length;
  if(!state.alarms.length){el.innerHTML=`<div class="mem-empty">No alarms.<br>Say "Set alarm for 7am"</div>`;return;}
  el.innerHTML=state.alarms.map(a=>`<div class="alarm-item"><span class="alarm-time"><span class="${a.active?"alarm-active-dot":""}"></span>${a.h%12||12}:${String(a.m).padStart(2,"0")} ${a.h<12?"AM":"PM"}</span><span class="alarm-label-txt">${a.label}</span><button class="alarm-del" onclick="deleteAlarm(${a.id})">×</button></div>`).join("");
}
function deleteAlarm(id){state.alarms=state.alarms.filter(a=>a.id!==id);P.alm();renderAlarms();}
function startAlarmChecker(){
  setInterval(()=>{
    const now=new Date(),nowH=now.getHours(),nowM=now.getMinutes(),nowS=now.getSeconds();
    if(nowS>20)return;
    state.alarms.forEach(alarm=>{
      if(!alarm.active||alarm.notified)return;
      if(alarm.h===nowH&&alarm.m===nowM){
        alarm.notified=true;triggerAlarm(alarm);
        if(alarm.repeat!=="once")setTimeout(()=>{alarm.notified=false;},65000);else alarm.active=false;
        P.alm();renderAlarms();
      }
    });
  },15000);
}
function triggerAlarm(a){
  const tl=`${a.h%12||12}:${String(a.m).padStart(2,"0")} ${a.h<12?"AM":"PM"}`;
  document.getElementById("alarmAlertText").textContent=`${a.label.toUpperCase()} — ${tl}`;
  document.getElementById("alarmAlert").classList.add("show");
  playAlarmSound();speak(`Alarm! ${a.label}. It is ${tl}.`);
  addChat("system",`⏰ Alarm: <b>${a.label}</b> at ${tl}`);
}
function playAlarmSound(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const b=(t,f,d)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=f;o.type="sine";g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.start(t);o.stop(t+d);};const t=ctx.currentTime;b(t,880,.2);b(t+.25,880,.2);b(t+.5,1100,.3);b(t+.9,880,.2);b(t+1.15,880,.2);b(t+1.4,1100,.3);}catch(e){}}
function dismissAlarm(){document.getElementById("alarmAlert").classList.remove("show");}
function showAlarmModal(){showModal("alarmModal");}
function saveAlarm(){
  const label=document.getElementById("alarmLabel").value.trim()||"Alarm";
  const timeVal=document.getElementById("alarmTime").value;const repeat=document.getElementById("alarmRepeat").value;
  if(!timeVal){alert("Pick a time.");return;}
  const[hS,mS]=timeVal.split(":");state.alarms.push({id:Date.now(),h:parseInt(hS),m:parseInt(mS),label,repeat,active:true,notified:false});
  P.alm();renderAlarms();closeModal("alarmModal");
  const msg=`Alarm set for ${parseInt(hS)%12||12}:${mS} ${parseInt(hS)<12?"AM":"PM"} — ${label}`;
  addChat("assistant",msg);speak(msg);
}

// ─── MEMORY ──────────────────────────────────────────────────
function saveMemory(text){
  state.memory.push({id:Date.now(),text,time:new Date().toLocaleString()});P.mem();renderMemory();
  if(/\d{1,2}[:\-]\d{1,2}|am|pm|\btoday\b|\btomorrow\b|\b(mon|tue|wed|thu|fri|sat|sun)/i.test(text)){return`Saved: "${text}". `+parseAndSetAlarm(text);}
  return`Saved to memory: "${text}"`;
}
function renderMemory(){
  const el=document.getElementById("memoryList");const mc=document.getElementById("memCount");const mr=document.getElementById("memCountR");
  if(mc)mc.textContent=state.memory.length;if(mr)mr.textContent=state.memory.length;
  if(!state.memory.length){el.innerHTML=`<div class="mem-empty">No memories.<br>Say "Remember…"</div>`;return;}
  el.innerHTML=state.memory.map(m=>`<div class="mem-item"><span class="mem-text">${m.text}</span><span class="mem-ts">${m.time}</span><button class="mem-del" onclick="deleteMem(${m.id})">×</button></div>`).join("");
}
function deleteMem(id){state.memory=state.memory.filter(m=>m.id!==id);P.mem();renderMemory();}

// ─── CONTACTS ────────────────────────────────────────────────
function renderContacts(){
  const el=document.getElementById("contactsList");
  if(!state.contacts.length){el.innerHTML=`<div class="mem-empty">No contacts.</div>`;return;}
  el.innerHTML=state.contacts.map(c=>`<div class="contact-item"><span class="contact-name">👤 ${c.name}</span><span class="contact-info">${c.phone||"no phone"} · ${c.email||"no email"}</span><button class="contact-del" onclick="deleteContact(${c.id})">×</button></div>`).join("");
}
function showContactModal(){showModal("contactModal");}
function saveContact(){
  const name=document.getElementById("contactName").value.trim();
  const phone=document.getElementById("contactPhone").value.trim();
  const email=document.getElementById("contactEmail").value.trim();
  if(!name){alert("Name required.");return;}
  const digits=phone.replace(/\D/g,"");
  if(phone&&digits.length<7){alert("Phone number must include country code (e.g. 919876543210).");return;}
  state.contacts.push({id:Date.now(),name,phone:digits||phone,email});P.con();renderContacts();closeModal("contactModal");
  ["contactName","contactPhone","contactEmail"].forEach(id=>document.getElementById(id).value="");
  addChat("system",`✅ Contact saved: <b>${name}</b>${digits?` — ${digits}`:""}${email?` — ${email}`:""}`);
}
function deleteContact(id){state.contacts=state.contacts.filter(c=>c.id!==id);P.con();renderContacts();}

// ─── EMAIL ───────────────────────────────────────────────────
function sendEmail(){
  const to=document.getElementById("emailTo").value.trim();const sub=document.getElementById("emailSubject").value.trim();const body=document.getElementById("emailBody").value.trim();
  if(!to){alert("Enter recipient email.");return;}
  openURL(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`);
  setTimeout(()=>openURL(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`),300);
  closeModal("emailModal");addChat("assistant","✅ Email opened in mail app and Gmail.");speak("Email opened. Please send.");
}
function copyEmail(){navigator.clipboard.writeText(`Subject: ${document.getElementById("emailSubject").value}\n\n${document.getElementById("emailBody").value}`).then(()=>addChat("system","📋 Copied."));}

// ─── MODALS ──────────────────────────────────────────────────
function showModal(id){document.getElementById(id).classList.add("show");}
function closeModal(id){document.getElementById(id).classList.remove("show");}
document.addEventListener("click",e=>{if(e.target.classList.contains("modal-overlay"))e.target.classList.remove("show");});

// ─── TTS — Deep Jarvis-style male voice ──────────────────────
// Voice priority: Google UK English Male → Microsoft George/David → Daniel → any deep male
function speak(text){
  if(!state.synth)return;
  state.synth.cancel();
  if(state.rec){try{state.rec.abort();}catch(e){} state.recRunning=false;}

  const clean=text
    .replace(/<[^>]+>/g," ")
    .replace(/```[\s\S]*?```/g,"Code has been written.")
    .replace(/`([^`]+)`/g,"$1")
    .replace(/[*_#>\[\]═─◈◉◇►▸]/g,"")
    .replace(/\n/g,". ")
    .replace(/\s+/g," ")
    .trim().substring(0,550);
  if(!clean)return;

  const u=new SpeechSynthesisUtterance(clean);
  // Jarvis voice settings: slightly slower for gravitas, deeper pitch
  u.rate  = state.lang==="en-IN"||state.lang==="en-US" ? 1.05 : 1.0;
  u.pitch = 0.82;   // deeper voice
  u.volume= 1;
  u.lang  = state.lang;

  const voices=state.synth.getVoices();
  const lb=state.lang.split("-")[0];

  if(lb==="en"){
    // For English: pick the deepest, most Jarvis-like male voice
    const malePref=[
      v=>v.name==="Google UK English Male",
      v=>v.name.includes("Microsoft George"),
      v=>v.name.includes("Microsoft David"),
      v=>v.name.includes("Daniel"),          // macOS deep male
      v=>v.name.includes("Google UK English"),
      v=>/male/i.test(v.name)&&v.lang.startsWith("en"),
      v=>v.name.includes("Arthur"),
      v=>v.name.includes("Alex"),
      v=>v.name.includes("Oliver"),
      v=>v.lang==="en-GB",
      v=>v.lang==="en-US",
      v=>v.lang.startsWith("en"),
    ];
    for(const p of malePref){const v=voices.find(p);if(v){u.voice=v;break;}}
  } else {
    // For Indian languages: prefer matching language voice
    const langPref=[
      v=>v.lang===state.lang,
      v=>v.lang.startsWith(lb),
      v=>v.lang==="hi-IN",
      v=>v.lang==="en-IN",
      v=>v.lang.startsWith("en"),
    ];
    for(const p of langPref){const v=voices.find(p);if(v){u.voice=v;break;}}
  }

  u.onstart=()=>{
    state.isSpeaking=true;setOrbMode("speak");setStatusBadge("SPEAKING","speaking");
    document.getElementById("speakOverlay").classList.add("show");
    setListenUI(false);state.stopWave&&state.stopWave();
  };
  const onDone=()=>{
    state.isSpeaking=false;
    document.getElementById("speakOverlay").classList.remove("show");
    if(state.isAwake){setOrbMode("listen");setStatusBadge("LISTENING","active");setListenUI(true);}
    else{setOrbMode("idle");setStatusBadge("STANDBY","");}
    resumeRec();
  };
  u.onend=onDone;u.onerror=onDone;
  state.synth.speak(u);
}
// Trigger voice load early for faster first utterance
if(window.speechSynthesis){
  window.speechSynthesis.onvoiceschanged=()=>{ window.speechSynthesis.getVoices(); };
  window.speechSynthesis.getVoices(); // pre-load
}

// ─── UI HELPERS ──────────────────────────────────────────────
function setOrbMode(mode){const o=document.getElementById("orbCore");o.className="orb-core";if(mode==="listen")o.classList.add("listening");if(mode==="speak")o.classList.add("speaking");}
function setStatusBadge(label,cls){const d=document.getElementById("listenDot"),l=document.getElementById("listenLabel");d.className="status-dot"+(cls?" "+cls:"");l.className="status-label"+(cls?" "+cls:"");l.textContent=label;}
function setListenUI(on){document.getElementById("micBtn").classList.toggle("active",on);if(on)state.startWave&&state.startWave();else state.stopWave&&state.stopWave();}
function setStateText(main,sub){document.getElementById("stateText").textContent=main;document.getElementById("stateSub").textContent=sub;}

// ─── CHAT — bubble layout (user RIGHT, AI LEFT) ──────────────
let _cid=0;
function addChat(role,html,thinking=false){
  const log=document.getElementById("chatLog"),id="m"+(_cid++);
  const rowClass={user:"user-row",assistant:"ai-row",system:"sys-row"}[role]||"sys-row";
  const sender={user:"YOU",assistant:"MAXIMUS",system:"SYSTEM"}[role]||"SYS";
  const row=document.createElement("div");row.className="chat-row "+rowClass;
  const senderEl=document.createElement("div");senderEl.className="chat-sender";senderEl.textContent=sender;
  const bubble=document.createElement("div");bubble.className="chat-bubble";bubble.id=id;
  bubble.innerHTML="<span class=\""+( thinking?"thinking":"" )+"\">" + html + "</span>";
  row.appendChild(senderEl);row.appendChild(bubble);
  log.appendChild(row);log.scrollTop=99999;return id;
}
function updateChat(id,html){
  const bubble=document.getElementById(id);if(!bubble)return;
  const sp=bubble.querySelector("span");if(!sp)return;
  sp.className="";sp.innerHTML=fmtText(html);
  document.getElementById("chatLog").scrollTop=99999;
}
function fmtText(t){
  if(!t)return"";
  return t
    .replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre><code>$2</code></pre>')
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^## (.+)$/gm,'<strong style="color:var(--c);display:block;margin:6px 0 2px">$1</strong>')
    .replace(/^### (.+)$/gm,'<strong style="display:block;margin:4px 0 2px">$1</strong>')
    .replace(/\n/g,'<br>');
}

// ─── INPUT ───────────────────────────────────────────────────
function handleKey(e){if(e.key==="Enter"&&!e.shiftKey)submitText();}
function submitText(){
  const inp=document.getElementById("textInput");const txt=inp.value.trim();if(!txt)return;inp.value="";
  if(!state.isAwake){state.isAwake=true;setOrbMode("listen");setStatusBadge("ACTIVE","active");}
  processInput(txt);
}
function quickAction(txt){if(!state.isAwake){state.isAwake=true;setOrbMode("listen");setStateText("ACTIVE","Quick action");}processInput(txt);}

// ─── ACTIVITY LOG ────────────────────────────────────────────
function logActivity(txt){
  const log=document.getElementById("activityLog");const d=document.createElement("div");d.className="act-item";d.textContent=`[${new Date().toLocaleTimeString()}] ${txt}`;log.insertBefore(d,log.firstChild);while(log.children.length>25)log.removeChild(log.lastChild);
}

// ─── MOBILE PANEL ────────────────────────────────────────────
function toggleMobileMenu(){const lp=document.getElementById("leftPanel"),rp=document.getElementById("rightPanel");const open=lp.classList.contains("open");lp.classList.toggle("open",!open);rp.classList.toggle("open",!open);}

// ─── CLEAR ───────────────────────────────────────────────────
function clearHistory(){if(!confirm("Clear all conversation history?"))return;state.chatHistory=[];P.hist();document.getElementById("chatLog").innerHTML="";addChat("system","🗑️ History cleared.");logActivity("History cleared");}
function clearFiles(){state.fileSlots=[];state.activeFileIdx=-1;renderFileSlots();addChat("system","🗑️ File contexts cleared.");}

// ─── API CHECK ───────────────────────────────────────────────
function checkApiKey(){
  const ok=MISTRAL_API_KEY&&MISTRAL_API_KEY!=="PASTE_YOUR_MISTRAL_API_KEY_HERE";
  const el=document.getElementById("sysStatus");
  if(ok){el.textContent="ONLINE";el.style.color="var(--ok)";}
  else{el.textContent="NO KEY";el.style.color="var(--err)";addChat("system",`⚠️ <b>Add your Mistral API key</b> in script.js line 5.<br>Get free key: <a href="https://console.mistral.ai" target="_blank" style="color:var(--c)">console.mistral.ai</a>`);}
}

// ─── SMART NOTIFICATIONS ─────────────────────────────────────
// Request notification permission on boot (ask once)
function initNotifications(){
  if("Notification" in window && Notification.permission==="default"){
    // Don't auto-prompt — wait for user to trigger a notification first
    // Will prompt on first "notify me" command
  }
}

// Fire a smart desktop notification
function fireNotification(title, body, icon="🤖"){
  if(!("Notification" in window)) return;
  const doFire=()=>new Notification(title,{
    body, icon:`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`,
    badge:`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>M</text></svg>`
  });
  if(Notification.permission==="granted") doFire();
  else if(Notification.permission!=="denied") Notification.requestPermission().then(p=>{if(p==="granted")doFire();});
}

// Smart alarm notifications — fire desktop notif 30 mins before alarm
function startSmartNotifChecker(){
  setInterval(()=>{
    const now=new Date();
    const inMins=(h,m)=>(h*60+m)-(now.getHours()*60+now.getMinutes());
    state.alarms.forEach(alarm=>{
      if(!alarm.active||alarm._notif30)return;
      const mins=inMins(alarm.h,alarm.m);
      if(mins===30){
        alarm._notif30=true;
        fireNotification("⏰ Upcoming Alarm",`"${alarm.label}" in 30 minutes (${alarm.h%12||12}:${String(alarm.m).padStart(2,"0")} ${alarm.h<12?"AM":"PM"})`, "⏰");
        addChat("system",`🔔 Reminder: <b>${alarm.label}</b> is in 30 minutes.`);
      }
      if(mins===5){
        fireNotification("⏰ Alarm in 5 minutes",`"${alarm.label}" fires at ${alarm.h%12||12}:${String(alarm.m).padStart(2,"0")} ${alarm.h<12?"AM":"PM"}`, "🚨");
      }
    });
    // Also fire notif when alarm actually triggers
  },60000);
}

// ─── CAMERA / LIVE CAPTURE ───────────────────────────────────
let cameraStream = null;

function showCameraModal(){
  const modal=document.getElementById("cameraModal");
  if(!modal)return;
  modal.classList.add("show");
  startCamera();
}

async function startCamera(){
  const vid=document.getElementById("cameraVideo");
  const snap=document.getElementById("snapBtn");
  const status=document.getElementById("cameraStatus");
  if(!vid) return;
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
    vid.srcObject=cameraStream;
    vid.play();
    if(status) status.textContent="Camera ready — take a photo to analyse";
    if(snap) snap.disabled=false;
  }catch(err){
    if(status) status.textContent="Camera access denied. Allow camera in browser settings.";
    addChat("system","⚠️ Camera access denied. Click the 🔒 icon in your address bar to allow camera.");
  }
}

function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
  const vid=document.getElementById("cameraVideo");
  if(vid) vid.srcObject=null;
  closeModal("cameraModal");
}

function snapPhoto(){
  const vid=document.getElementById("cameraVideo");
  const canvas=document.getElementById("cameraCanvas");
  if(!vid||!canvas) return;
  canvas.width=vid.videoWidth||640;
  canvas.height=vid.videoHeight||480;
  canvas.getContext("2d").drawImage(vid,0,0);
  const b64=canvas.toDataURL("image/jpeg",.85).split(",")[1];
  // Create file slot from camera snap
  const slot={id:Date.now()+"_cam",name:"camera_photo.jpg",ext:"jpg",type:"image",
    content:"",b64,mediaType:"image/jpeg",summary:"",status:"ready"};
  state.fileSlots.push(slot);
  state.activeFileIdx=state.fileSlots.length-1;
  renderFileSlots();
  stopCamera();
  addChat("system","📸 Photo captured! Analysing now…");
  analyzeFileWithQuestion("Analyse this photo completely. Describe everything you see, read any visible text (OCR), identify objects, people, places, charts, or any notable elements.");
}

// ─── LIVE LOCATION WIDGET ────────────────────────────────────
function getMyLocation(){
  if(!navigator.geolocation){addChat("system","⚠️ Geolocation not supported.");return;}
  const tid=addChat("assistant","📍 Getting your location…",true);
  navigator.geolocation.getCurrentPosition(pos=>{
    const{latitude:lat,longitude:lng,accuracy}=pos.coords;
    const mapURL=`https://www.google.com/maps?q=${lat},${lng}&z=15`;
    openURL(mapURL);
    updateChat(tid,`📍 <b>Your Location</b><br>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}<br>Accuracy: ±${Math.round(accuracy)}m<br><a href="${mapURL}" target="_blank" style="color:var(--c)">Open in Google Maps ↗</a>`);
    speak("Location found. Opening Google Maps.");
  },err=>{
    updateChat(tid,"Location access denied. Please allow location in browser settings (🔒 icon).");
    speak("Location access was denied. Please check your browser settings.");
  },{enableHighAccuracy:true,timeout:8000});
}

// ═══════════════════════════════════════════════════════════════
//  MAXIMUS v10 — ADVANCED FEATURES
//  1. Smart Learning Memory (pattern detection, proactive reminders)
//  2. Google Calendar API (real read/write)
//  3. Gmail API (real read/summarize/reply)
//  4. Spotify Web API (real play/pause/skip/volume)
//  5. WhatsApp Web message reading helper
// ═══════════════════════════════════════════════════════════════

// ─── API KEYS SECTION ────────────────────────────────────────
// Fill these in to unlock each feature:
const GOOGLE_CLIENT_ID   = "744506919086-92fanjuup4jr992m8e66vl3ecpdmnltq.apps.googleusercontent.com";     // console.cloud.google.com → OAuth 2.0
const SPOTIFY_CLIENT_ID  = "ea0f7dd649c145f6a4d2eeacf40022a8";    // developer.spotify.com → Dashboard
const SPOTIFY_REDIRECT   = window.location.href.split("?")[0]; // auto-detected

// ═══════════════════════════════════════════════════════════════
//  ① SMART LEARNING MEMORY
//  Tracks: what user asks about, when, how often, day patterns
//  Proactively reminds when pattern matches current time/day
// ═══════════════════════════════════════════════════════════════

const BEHAVIOR_KEY = "mx_behavior";
let behaviorDB = {};   // { topic: { count, lastH, lastDay, days:[], hours:[] } }

function loadBehavior(){
  try{ behaviorDB = JSON.parse(localStorage.getItem(BEHAVIOR_KEY)||"{}"); }
  catch(e){ behaviorDB = {}; }
}

function saveBehavior(){ try{ localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(behaviorDB)); }catch(e){} }

// Called every time the user says something — learns patterns
function learnFromInput(text){
  const now  = new Date();
  const hour = now.getHours();
  const day  = now.getDay(); // 0=Sun … 6=Sat

  // Topic buckets — broad categories we track
  const topics = {
    cricket:    /cricket|ipl|match|score|team|wicket|batting/i,
    music:      /music|song|spotify|play|track|artist|album/i,
    news:       /news|headlines|latest|today|current events/i,
    weather:    /weather|rain|temperature|forecast|humidity/i,
    work:       /meeting|standup|call|task|deadline|project|work|office/i,
    health:     /exercise|gym|workout|walk|run|medicine|water|sleep/i,
    food:       /food|eat|restaurant|lunch|dinner|breakfast|order/i,
    finance:    /stock|crypto|bitcoin|price|money|investment|market/i,
  };

  for(const [topic, re] of Object.entries(topics)){
    if(!re.test(text)) continue;
    if(!behaviorDB[topic]) behaviorDB[topic] = { count:0, hours:[], days:[], lastH:-1, lastDay:-1 };
    const b = behaviorDB[topic];
    b.count++;
    b.lastH   = hour;
    b.lastDay = day;
    b.hours.push(hour);   if(b.hours.length > 50) b.hours.shift();
    b.days.push(day);     if(b.days.length  > 50) b.days.shift();
  }
  saveBehavior();
}

// Get the most common value in an array
function mode(arr){ const f={}; arr.forEach(v=>f[v]=(f[v]||0)+1); return Object.entries(f).sort((a,b)=>b[1]-a[1])[0]?.[0]; }

// Run every 15 mins — check if a learned pattern matches now → proactively remind
function startPatternReminder(){
  setInterval(()=>{
    const now  = new Date();
    const hour = now.getHours();
    const day  = now.getDay();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    for(const [topic, b] of Object.entries(behaviorDB)){
      if(b.count < 3) continue;           // need at least 3 data points
      const usualHour = parseInt(mode(b.hours));
      const usualDay  = parseInt(mode(b.days));
      const isWeekday = day>=1&&day<=5;

      // Pattern matches this exact hour (within 0 minutes)
      if(now.getMinutes() !== 0) continue;
      if(usualHour !== hour) continue;

      // Check day pattern — if always same day, only fire that day
      const dayStrong = b.days.filter(d=>d===usualDay).length / b.days.length > 0.6;
      if(dayStrong && usualDay !== day) continue;

      // Avoid firing twice in same hour
      const lastFiredKey = `mx_fired_${topic}_${hour}_${day}`;
      if(localStorage.getItem(lastFiredKey)) continue;
      localStorage.setItem(lastFiredKey, "1");
      setTimeout(()=>localStorage.removeItem(lastFiredKey), 3700000); // clear after ~1hr

      // Build proactive message
      const labels = {
        cricket:"You usually check cricket scores around this time",
        music:  "You usually listen to music around now",
        news:   "Time for your daily news check",
        weather:"You usually check the weather around now",
        work:   `You often have work tasks on ${days[day]}s at this hour`,
        health: "Time for your health routine — exercise or water?",
        food:   "You usually think about food around this time",
        finance:"You usually check markets or prices around now",
      };

      const msg = labels[topic] || `You usually ask about ${topic} around this time`;
      addChat("system", `🧠 <b>Pattern detected:</b> ${msg}. Want me to check?`);
      speak(`${msg}. Should I check for you?`);
      fireNotification("MAXIMUS Smart Reminder", msg, "🧠");
      logActivity(`Pattern: ${topic} at ${hour}:00`);
    }
  }, 60000); // check every minute
}

// Show what Maximus has learned
function showLearnedPatterns(){
  if(!Object.keys(behaviorDB).length){
    addChat("system","🧠 No patterns learned yet. Keep using Maximus and it will start recognising your habits.");
    return;
  }
  const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let html = "🧠 <b>What I've learned about you:</b><br><br>";
  for(const [topic,b] of Object.entries(behaviorDB)){
    if(b.count<2) continue;
    const h = parseInt(mode(b.hours));
    const d = parseInt(mode(b.days));
    const ampm = h<12?"AM":"PM";
    const h12  = h%12||12;
    html += `<b>${topic.charAt(0).toUpperCase()+topic.slice(1)}</b>: usually at <b>${h12}:00 ${ampm}</b> on <b>${days[d]}s</b> (${b.count} times)<br>`;
  }
  addChat("assistant", html);
  speak("Here's what I've learned about your habits.");
}

// Hook learnFromInput into processInput
const _origProcess = window.processInput;

// ═══════════════════════════════════════════════════════════════
//  ② GOOGLE OAUTH — shared by Calendar + Gmail
//  Flow: popup → user signs in → token stored in memory
// ═══════════════════════════════════════════════════════════════

let googleToken    = null;
let googleTokenExp = 0;

function isGoogleReady(){ return googleToken && Date.now() < googleTokenExp; }

function googleSignIn(scope){
  return new Promise((resolve, reject)=>{
    if(GOOGLE_CLIENT_ID === "PASTE_GOOGLE_CLIENT_ID_HERE"){
      addChat("system",`⚙️ <b>Google API not configured.</b><br>
To enable Google Calendar & Gmail:<br>
1. Go to <a href="https://console.cloud.google.com" target="_blank" style="color:var(--c)">console.cloud.google.com</a><br>
2. Create project → Enable <b>Gmail API</b> + <b>Google Calendar API</b><br>
3. Create OAuth 2.0 Client ID (Web Application)<br>
4. Add <code>${window.location.href.split("?")[0]}</code> to Authorized redirect URIs<br>
5. Paste Client ID into script.js line: <code>GOOGLE_CLIENT_ID</code>`);
      reject("no_key"); return;
    }

    const scopes = encodeURIComponent(scope);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT)}&response_type=token&scope=${scopes}&prompt=consent`;
    const popup = window.open(url,"google_auth","width=500,height=600,left=400,top=100");

    const check = setInterval(()=>{
      try{
        const u = popup.location.href;
        if(u.includes("access_token")){
          const params = new URLSearchParams(u.split("#")[1]||u.split("?")[1]);
          googleToken    = params.get("access_token");
          googleTokenExp = Date.now() + (parseInt(params.get("expires_in")||"3600")*1000);
          popup.close();
          clearInterval(check);
          resolve(googleToken);
        }
      }catch(e){}
      if(popup.closed){ clearInterval(check); reject("closed"); }
    },400);
  });
}

async function ensureGoogle(scope){
  if(isGoogleReady()) return googleToken;
  addChat("system","🔐 Opening Google sign-in…");
  return await googleSignIn(scope);
}

// ═══════════════════════════════════════════════════════════════
//  ③ GOOGLE CALENDAR API — real read + write
// ═══════════════════════════════════════════════════════════════

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar";

async function calendarAddReal(details){
  const tid = addChat("assistant","📅 Parsing event details…",true);
  try{
    // Parse with AI
    const raw = await callMistral(`Extract event from: "${details}". Today is ${new Date().toLocaleDateString("en-IN")} (${new Date().toISOString().slice(0,10)}).
Return ONLY valid JSON (no markdown):
{"summary":"event title","start":"YYYY-MM-DDTHH:MM:SS","end":"YYYY-MM-DDTHH:MM:SS","description":"","location":""}`);

    let ev = null;
    try{ ev = JSON.parse(raw.replace(/```json|```/g,"").trim()); }
    catch(e){
      // Fallback defaults
      const d = new Date(); d.setHours(9,0,0);
      ev = { summary:details, start:d.toISOString().slice(0,19), end:new Date(d.getTime()+3600000).toISOString().slice(0,19) };
    }

    updateChat(tid,`📅 Creating: <b>${ev.summary}</b>…`);

    const token = await ensureGoogle(CAL_SCOPE);

    const body = {
      summary:     ev.summary     || details,
      description: ev.description || "",
      location:    ev.location    || "",
      start:{ dateTime: ev.start+"Z", timeZone:"Asia/Kolkata" },
      end:  { dateTime: ev.end  +"Z", timeZone:"Asia/Kolkata" },
    };

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events",{
      method:"POST",
      headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });

    if(!res.ok){ const e=await res.json(); throw new Error(e.error?.message||res.status); }
    const created = await res.json();

    const startStr = new Date(ev.start).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
    updateChat(tid,`✅ <b>Event created in Google Calendar!</b><br>📅 <b>${created.summary}</b><br>🕐 ${startStr}<br><a href="${created.htmlLink}" target="_blank" style="color:var(--c)">Open in Google Calendar ↗</a>`);
    speak(`Done, sir. "${created.summary}" has been added to your calendar.`);
    logActivity(`Calendar created: ${created.summary}`);

    // Also save as alarm if it's today
    const evDate = new Date(ev.start);
    const today  = new Date();
    if(evDate.toDateString()===today.toDateString()){
      state.alarms.push({id:Date.now(),h:evDate.getHours(),m:evDate.getMinutes(),label:created.summary,repeat:"once",active:true,notified:false});
      P.alm(); renderAlarms();
    }

  }catch(err){
    if(err==="no_key"||err==="closed") return;
    updateChat(tid,`Failed: ${err.message||err}`);
    speak("Could not create the event. Please check your Google API setup.");
  }
}

async function calendarReadReal(when="today"){
  const tid = addChat("assistant","📅 Fetching your calendar…",true);
  try{
    const token = await ensureGoogle(CAL_SCOPE);

    const now   = new Date();
    let tMin, tMax;
    if(when==="today"){
      tMin = new Date(now); tMin.setHours(0,0,0,0);
      tMax = new Date(now); tMax.setHours(23,59,59,999);
    } else if(when==="tomorrow"){
      tMin = new Date(now); tMin.setDate(tMin.getDate()+1); tMin.setHours(0,0,0,0);
      tMax = new Date(tMin); tMax.setHours(23,59,59,999);
    } else {
      tMin = new Date(now); tMin.setHours(0,0,0,0);
      tMax = new Date(now); tMax.setDate(tMax.getDate()+7); tMax.setHours(23,59,59,999);
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${tMin.toISOString()}&timeMax=${tMax.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`;
    const res = await fetch(url,{ headers:{ Authorization:`Bearer ${token}` } });
    if(!res.ok){ const e=await res.json(); throw new Error(e.error?.message||res.status); }

    const data  = await res.json();
    const items = data.items||[];

    if(!items.length){
      updateChat(tid,`📅 No events scheduled for <b>${when}</b>.`);
      speak(`Your calendar is clear for ${when}, sir.`);
      return;
    }

    let html = `📅 <b>Your schedule for ${when}:</b><br><br>`;
    let speakText = `You have ${items.length} event${items.length>1?"s":""} for ${when}. `;
    items.forEach(ev=>{
      const start = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "All day";
      const end   = ev.end?.dateTime   ? new Date(ev.end.dateTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})   : "";
      html += `⏰ <b>${start}${end?" – "+end:""}</b> — ${ev.summary||"Untitled"}<br>`;
      if(ev.location) html += `&nbsp;&nbsp;&nbsp;📍 ${ev.location}<br>`;
      speakText += `${ev.summary} at ${start}. `;
    });

    updateChat(tid, html);
    speak(speakText);
    logActivity(`Calendar read: ${items.length} events`);
  }catch(err){
    if(err==="no_key"||err==="closed") return;
    updateChat(tid,`Calendar error: ${err.message||err}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ④ GMAIL API — real read, summarize, reply
// ═══════════════════════════════════════════════════════════════

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

function b64Decode(str){
  const s = str.replace(/-/g,"+").replace(/_/g,"/");
  try{ return decodeURIComponent(escape(atob(s))); }catch(e){ return atob(s); }
}

function extractEmailBody(payload){
  if(!payload) return "";
  if(payload.body?.data) return b64Decode(payload.body.data);
  if(payload.parts){
    for(const p of payload.parts){
      if(p.mimeType==="text/plain"&&p.body?.data) return b64Decode(p.body.data);
    }
    for(const p of payload.parts){
      if(p.mimeType==="text/html"&&p.body?.data){
        const html = b64Decode(p.body.data);
        return html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      }
    }
  }
  return "";
}

function getHeader(headers, name){
  return headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||"";
}

async function gmailRead(filterFrom="", maxResults=5){
  const tid = addChat("assistant","📧 Reading your emails…",true);
  try{
    const token = await ensureGoogle(GMAIL_SCOPE);

    let query = "is:unread in:inbox";
    if(filterFrom) query += ` from:${filterFrom}`;

    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,{
      headers:{ Authorization:`Bearer ${token}` }
    });
    if(!listRes.ok){ const e=await listRes.json(); throw new Error(e.error?.message||listRes.status); }
    const listData = await listRes.json();
    const messages = listData.messages||[];

    if(!messages.length){
      const msg = filterFrom ? `No unread emails from ${filterFrom}.` : "Your inbox is clear — no unread emails.";
      updateChat(tid,`📧 ${msg}`);
      speak(msg);
      return;
    }

    updateChat(tid,`📧 Found ${messages.length} email${messages.length>1?"s":""}. Fetching details…`);

    // Fetch each message in parallel
    const details = await Promise.all(messages.map(async m=>{
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,{
        headers:{ Authorization:`Bearer ${token}` }
      });
      return r.ok ? r.json() : null;
    }));

    // Summarize with AI
    let emailDump = "";
    const cards   = [];
    details.forEach((d,i)=>{
      if(!d) return;
      const headers = d.payload?.headers||[];
      const from    = getHeader(headers,"From");
      const subj    = getHeader(headers,"Subject");
      const date    = getHeader(headers,"Date");
      const body    = extractEmailBody(d.payload).substring(0,600);
      cards.push({id:d.id, from, subj, date, body, snippet:d.snippet||""});
      emailDump += `\n--- Email ${i+1} ---\nFrom: ${from}\nSubject: ${subj}\nDate: ${date}\nSnippet: ${d.snippet||""}\nBody: ${body}\n`;
    });

    // Ask AI to summarise all emails
    const summary = await callMistral(`Summarise these ${messages.length} unread emails for the user. For each: who it's from, what it's about, and if action is needed. Be concise but complete.\n\n${emailDump}`);

    // Build rich HTML card display
    let html = `📧 <b>${messages.length} unread email${messages.length>1?"s":""}${filterFrom?" from "+filterFrom:""}:</b><br><br>`;
    cards.forEach((c,i)=>{
      html += `<div style="background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.12);border-radius:8px;padding:10px;margin:6px 0">
        <div style="font-weight:700;color:var(--c)">${c.subj||"(no subject)"}</div>
        <div style="font-size:12px;color:var(--t2);margin:2px 0">From: ${c.from} · ${c.date}</div>
        <div style="font-size:13px;margin-top:4px">${c.snippet}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="gmailReplyModal('${c.id}','${c.from.replace(/'/g,"\\'")}','${c.subj.replace(/'/g,"\\'")}','${c.body.substring(0,200).replace(/'/g,"\\'").replace(/\n/g," ")}')" style="background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.25);border-radius:6px;color:var(--c);font-size:10px;padding:3px 10px;cursor:pointer">↩ Reply</button>
          <button onclick="gmailSummariseThread('${c.id}')" style="background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.25);border-radius:6px;color:#b39ddb;font-size:10px;padding:3px 10px;cursor:pointer">🤖 Summarise</button>
        </div>
      </div>`;
    });

    html += `<br><b>AI Summary:</b><br>${fmtText(summary)}`;
    updateChat(tid, html);
    speak(summary.replace(/<[^>]+>/g," ").substring(0,400));
    logActivity(`Gmail: read ${messages.length} emails`);

  }catch(err){
    if(err==="no_key"||err==="closed") return;
    updateChat(tid,`Gmail error: ${err.message||err}`);
  }
}

async function gmailSummariseThread(messageId){
  const tid = addChat("assistant","🤖 Fetching full thread…",true);
  try{
    const token = await ensureGoogle(GMAIL_SCOPE);

    // Get thread ID from message
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,{
      headers:{ Authorization:`Bearer ${token}` }
    });
    const msgData = await msgRes.json();
    const threadId = msgData.threadId;

    // Fetch full thread
    const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,{
      headers:{ Authorization:`Bearer ${token}` }
    });
    const thread = await threadRes.json();
    const msgs   = thread.messages||[];

    let dump = "";
    msgs.forEach((m,i)=>{
      const h    = m.payload?.headers||[];
      const from = getHeader(h,"From");
      const subj = getHeader(h,"Subject");
      const body = extractEmailBody(m.payload).substring(0,800);
      dump += `\n--- Message ${i+1} ---\nFrom: ${from}\nSubject: ${subj}\n${body}\n`;
    });

    const summary = await callMistral(`Summarise this email thread comprehensively. Cover: what it's about, who the participants are, key decisions or requests, and what action (if any) is needed.\n\n${dump}`);
    updateChat(tid, `📧 <b>Thread Summary (${msgs.length} messages):</b><br><br>${fmtText(summary)}`);
    speak(summary.replace(/<[^>]+>/g," ").substring(0,400));

  }catch(err){
    if(err==="no_key"||err==="closed") return;
    updateChat(tid,`Thread error: ${err.message||err}`);
  }
}

async function gmailReplyModal(messageId, from, subject, originalBody){
  // Use AI to draft reply, then show in email modal
  const tid = addChat("assistant","✍️ Drafting reply…",true);
  try{
    const draft = await callMistral(`Write a professional reply email to this message.
Original from: ${from}
Subject: ${subject}
Original content: ${originalBody}
Return ONLY valid JSON: {"subject":"Re: ...","body":"..."}`);

    let parsed = {subject:`Re: ${subject}`, body:draft};
    try{ Object.assign(parsed, JSON.parse(draft.replace(/```json|```/g,"").trim())); }catch(e){}

    updateChat(tid,"✅ Reply drafted. Review and send.");
    document.getElementById("emailTo").value      = from.match(/<(.+)>/)?.[1]||from;
    document.getElementById("emailSubject").value = parsed.subject;
    document.getElementById("emailBody").value    = parsed.body;
    showModal("emailModal");
    speak("Reply drafted. Please review and send.");
  }catch(err){
    updateChat(tid,`Could not draft reply: ${err.message}`);
  }
}

// Read emails aloud one by one
async function gmailReadAloud(filterFrom=""){
  await gmailRead(filterFrom, 3); // read top 3
}

// ═══════════════════════════════════════════════════════════════
//  ⑤ SPOTIFY WEB API — real playback control
//  Requires: Premium Spotify account + Developer App
//  Scopes: user-read-playback-state user-modify-playback-state
//          user-read-currently-playing streaming playlist-read-private
// ═══════════════════════════════════════════════════════════════

let spotifyToken    = null;
let spotifyTokenExp = 0;
let spotifyPlayer   = null;        // Web Playback SDK player instance
let spotifyDeviceId = null;        // Our browser device ID
let spotifySDKReady = false;

const SPOTIFY_SCOPE = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "user-library-read"
].join(" ");

function isSpotifyReady(){ return spotifyToken && Date.now() < spotifyTokenExp; }

// OAuth PKCE-less implicit flow (simpler for a local app)
// ─── SPOTIFY PKCE AUTH ───────────────────────────────────────
// Spotify removed implicit flow in 2024. We now use PKCE:
// 1. Generate random code_verifier
// 2. Hash it → code_challenge (SHA-256 → base64url)
// 3. Open auth popup with response_type=code + code_challenge
// 4. Popup redirects back with ?code=xxx
// 5. Exchange code for access_token via POST (no client secret needed)

async function generatePKCE(){
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
    .map(b=>b.toString(36)).join("").substring(0,64);
  const data     = new TextEncoder().encode(verifier);
  const digest   = await crypto.subtle.digest("SHA-256", data);
  const challenge= btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return { verifier, challenge };
}

// The redirect URI must exactly match what's in Spotify Dashboard
// For a local file:// page use the page URL without query string
function getSpotifyRedirect(){
  // Strip any existing ?code= or #... from URL
  return window.location.origin + window.location.pathname;
}

function spotifySignIn(){
  return new Promise(async (resolve, reject)=>{
    if(SPOTIFY_CLIENT_ID==="PASTE_SPOTIFY_CLIENT_ID_HERE"){
      addChat("system",`⚙️ <b>Spotify API not configured.</b><br>
To enable real Spotify control:<br>
1. Go to <a href="https://developer.spotify.com/dashboard" target="_blank" style="color:var(--c)">developer.spotify.com/dashboard</a><br>
2. Create App → <b>Edit Settings</b> → add this Redirect URI:<br>
   <code style="font-size:10px;word-break:break-all">${getSpotifyRedirect()}</code><br>
3. Get your <b>Client ID</b> from the dashboard<br>
4. Paste it into script.js line: <code>SPOTIFY_CLIENT_ID</code><br>
5. Requires <b>Spotify Premium</b> for playback control`);
      reject("no_key"); return;
    }

    try{
      // Generate PKCE pair
      const { verifier, challenge } = await generatePKCE();
      // Store verifier so we can exchange the code when popup returns
      sessionStorage.setItem("sp_verifier", verifier);
      sessionStorage.setItem("sp_redirect",  getSpotifyRedirect());

      const params = new URLSearchParams({
        client_id:             SPOTIFY_CLIENT_ID,
        response_type:         "code",          // ← PKCE requires "code" not "token"
        redirect_uri:          getSpotifyRedirect(),
        scope:                 SPOTIFY_SCOPE,
        code_challenge_method: "S256",
        code_challenge:        challenge,
        show_dialog:           "true",
      });

      const authURL = "https://accounts.spotify.com/authorize?" + params.toString();
      const popup   = window.open(authURL, "spotify_auth", "width=480,height=660,left=300,top=80");

      if(!popup){
        // Popup blocked — fall back to same-window redirect
        sessionStorage.setItem("sp_pending","1");
        window.location.href = authURL;
        reject("redirecting"); return;
      }

      // Poll for the authorization code in the popup URL
      const check = setInterval(async ()=>{
        try{
          const pu = popup.location.href;
          if(pu.includes("code=")){
            const code = new URLSearchParams(popup.location.search).get("code");
            popup.close();
            clearInterval(check);
            await exchangeSpotifyCode(code, verifier);
            resolve(spotifyToken);
          } else if(pu.includes("error=")){
            popup.close();
            clearInterval(check);
            reject("user_cancelled");
          }
        }catch(e){ /* cross-origin — still loading, keep polling */ }
        if(popup.closed){ clearInterval(check); reject("closed"); }
      }, 300);

    }catch(err){ reject(err); }
  });
}

// Exchange authorization code for access token (PKCE — no client secret needed)
async function exchangeSpotifyCode(code, verifier){
  const res = await fetch("https://accounts.spotify.com/api/token",{
    method: "POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  getSpotifyRedirect(),
      client_id:     SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }).toString()
  });
  if(!res.ok){
    const e = await res.json().catch(()=>({}));
    throw new Error(e.error_description || e.error || "Token exchange failed");
  }
  const data = await res.json();
  spotifyToken    = data.access_token;
  spotifyTokenExp = Date.now() + (data.expires_in||3600)*1000;
  // Save refresh token too
  if(data.refresh_token) localStorage.setItem("sp_refresh", data.refresh_token);
  localStorage.setItem("sp_token", spotifyToken);
  localStorage.setItem("sp_exp",   String(spotifyTokenExp));
  initSpotifySDK();
  addChat("system","✅ <b>Spotify connected via PKCE!</b> You can now play, pause, skip and control volume.");
}

// Refresh expired token silently using refresh_token
async function refreshSpotifyToken(){
  const refresh = localStorage.getItem("sp_refresh");
  if(!refresh) return false;
  try{
    const res = await fetch("https://accounts.spotify.com/api/token",{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refresh,
        client_id:     SPOTIFY_CLIENT_ID,
      }).toString()
    });
    if(!res.ok) return false;
    const data      = await res.json();
    spotifyToken    = data.access_token;
    spotifyTokenExp = Date.now() + (data.expires_in||3600)*1000;
    if(data.refresh_token) localStorage.setItem("sp_refresh", data.refresh_token);
    localStorage.setItem("sp_token", spotifyToken);
    localStorage.setItem("sp_exp",   String(spotifyTokenExp));
    return true;
  }catch(e){ return false; }
}

// Check URL on page load — handle redirect back from Spotify auth
async function handleSpotifyCallback(){
  const params = new URLSearchParams(window.location.search);
  const code   = params.get("code");
  const err    = params.get("error");
  if(!code && !err) return;

  // Clean URL immediately
  window.history.replaceState({}, document.title, window.location.pathname);

  if(err){ addChat("system",`⚠️ Spotify auth cancelled: ${err}`); return; }
  if(code){
    const verifier = sessionStorage.getItem("sp_verifier");
    if(!verifier){ addChat("system","⚠️ Spotify auth error: verifier missing. Try again."); return; }
    sessionStorage.removeItem("sp_verifier");
    sessionStorage.removeItem("sp_redirect");
    try{
      await exchangeSpotifyCode(code, verifier);
      addChat("assistant","✅ <b>Spotify connected!</b> Try: <i>play Blinding Lights on Spotify</i>");
      speak("Spotify connected successfully, sir.");
    }catch(e){
      addChat("system",`⚠️ Spotify token exchange failed: ${e.message}`);
    }
  }
}

async function ensureSpotify(){
  // 1. Use in-memory token if still valid
  if(isSpotifyReady()) return spotifyToken;

  // 2. Try cached token from localStorage
  const cached    = localStorage.getItem("sp_token");
  const cachedExp = parseInt(localStorage.getItem("sp_exp")||"0");
  if(cached && Date.now() < cachedExp){
    spotifyToken    = cached;
    spotifyTokenExp = cachedExp;
    return spotifyToken;
  }

  // 3. Try silent refresh with refresh_token
  const refreshed = await refreshSpotifyToken();
  if(refreshed) return spotifyToken;

  // 4. Full sign-in needed
  addChat("system","🔐 Connecting to Spotify… (sign in when the popup opens)");
  return await spotifySignIn();
}

// Load Spotify Web Playback SDK dynamically
function initSpotifySDK(){
  if(spotifySDKReady||!spotifyToken) return;
  if(!document.getElementById("spotify-sdk")){
    const s = document.createElement("script");
    s.id  = "spotify-sdk";
    s.src = "https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(s);
  }
  window.onSpotifyWebPlaybackSDKReady = ()=>{
    spotifyPlayer = new window.Spotify.Player({
      name:"MAXIMUS AI",
      getOAuthToken: cb => cb(spotifyToken),
      volume: 0.8
    });
    spotifyPlayer.addListener("ready",({device_id})=>{
      spotifyDeviceId = device_id;
      spotifySDKReady = true;
      addChat("system","🎵 <b>Spotify connected!</b> MAXIMUS can now control playback directly.");
      logActivity("Spotify SDK ready");
    });
    spotifyPlayer.addListener("not_ready",({device_id})=>{ spotifyDeviceId=null; spotifySDKReady=false; });
    spotifyPlayer.addListener("player_state_changed", state=>{ if(state) updateSpotifyUI(state); });
    spotifyPlayer.connect();
  };
}

// Transfer playback to our browser device
async function transferToMaximus(){
  if(!spotifyDeviceId) return;
  await fetch("https://api.spotify.com/v1/me/player",{
    method:"PUT",
    headers:{ Authorization:`Bearer ${spotifyToken}`, "Content-Type":"application/json" },
    body: JSON.stringify({ device_ids:[spotifyDeviceId], play:true })
  });
}

// ── Spotify: Search then Play ──
async function spotifyPlay(query){
  const tid = addChat("assistant",`🎵 Searching Spotify for: <b>${query}</b>…`,true);
  try{
    const token = await ensureSpotify();

    // Search for track
    const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist&limit=5`,{
      headers:{ Authorization:`Bearer ${token}` }
    });
    if(!searchRes.ok){ const e=await searchRes.json(); throw new Error(e.error?.message||searchRes.status); }
    const searchData = await searchRes.json();
    const tracks     = searchData.tracks?.items||[];

    if(!tracks.length){
      updateChat(tid,`❌ No results found for "${query}" on Spotify.`);
      speak(`Could not find ${query} on Spotify.`);
      return;
    }

    const track = tracks[0];
    const uri   = track.uri;
    const name  = track.name;
    const artist= track.artists?.[0]?.name||"Unknown";
    const album = track.album?.name||"";
    const cover = track.album?.images?.[0]?.url||"";

    // Play via Web Playback SDK (in-browser) or active device
    let deviceId = spotifyDeviceId;

    // If no browser device, try to use any active device
    if(!deviceId){
      const devRes = await fetch("https://api.spotify.com/v1/me/player/devices",{
        headers:{ Authorization:`Bearer ${token}` }
      });
      const devData = await devRes.json();
      const active  = devData.devices?.find(d=>d.is_active) || devData.devices?.[0];
      if(active) deviceId = active.id;
    }

    if(!deviceId){
      // No device — open Spotify web as final fallback
      updateChat(tid,`⚠️ No active Spotify device found. Opening Spotify…`);
      openSpotify(query);
      return;
    }

    // Transfer to our device if needed
    if(spotifyDeviceId && !spotifySDKReady){
      await transferToMaximus();
      await new Promise(r=>setTimeout(r,800));
    }

    // Start playback
    const playRes = await fetch(`https://api.spotify.com/v1/me/player/play${deviceId?"?device_id="+deviceId:""}`,{
      method:"PUT",
      headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify({ uris:[uri] })
    });

    if(playRes.status===403){
      updateChat(tid,`⚠️ Spotify Premium required for playback control. Opening Spotify instead…`);
      openSpotify(query); return;
    }

    // Show now playing card
    const html = `🎵 <b>Now Playing</b><br>
<div style="display:flex;gap:12px;align-items:center;margin-top:8px;background:rgba(30,215,96,.06);border:1px solid rgba(30,215,96,.2);border-radius:10px;padding:10px">
  ${cover?`<img src="${cover}" style="width:56px;height:56px;border-radius:6px;flex-shrink:0">`:""}
  <div style="flex:1;min-width:0">
    <div style="font-weight:700;color:#1ed760;font-size:15px">${name}</div>
    <div style="color:var(--t2);font-size:13px">${artist} · ${album}</div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button onclick="spotifyControl('pause')"  style="${spBtn()}">⏸ Pause</button>
      <button onclick="spotifyControl('next')"   style="${spBtn()}">⏭ Next</button>
      <button onclick="spotifyControl('prev')"   style="${spBtn()}">⏮ Prev</button>
      <button onclick="spotifyVolumeUp()"        style="${spBtn()}">🔊 Vol+</button>
      <button onclick="spotifyVolumeDown()"      style="${spBtn()}">🔉 Vol-</button>
      <button onclick="spotifyNowPlaying()"      style="${spBtn('var(--c)')}">🎶 Info</button>
    </div>
  </div>
</div>`;
    updateChat(tid, html);
    speak(`Playing ${name} by ${artist}.`);
    logActivity(`Spotify playing: ${name} — ${artist}`);

  }catch(err){
    if(err==="no_key"||err==="closed") return;
    updateChat(tid,`Spotify error: ${err.message||err}`);
    speak("Could not play on Spotify.");
  }
}

function spBtn(color="rgba(255,255,255,.7)"){
  return `background:rgba(30,215,96,.12);border:1px solid rgba(30,215,96,.28);border-radius:6px;color:${color};font-size:11px;padding:4px 10px;cursor:pointer`;
}

// Pause / Resume / Next / Prev / Volume
async function spotifyControl(action){
  try{
    const token = await ensureSpotify();
    const eps   = { pause:"pause", play:"play", next:"next", prev:"previous" };
    const method= (action==="next"||action==="prev") ? "POST" : "PUT";
    const ep    = eps[action]||action;
    const res   = await fetch(`https://api.spotify.com/v1/me/player/${ep}`,{
      method, headers:{ Authorization:`Bearer ${token}` }
    });
    const labels = { pause:"⏸ Paused", play:"▶ Playing", next:"⏭ Skipped to next track", prev:"⏮ Back to previous track" };
    const msg = labels[action]||action;
    addChat("assistant",`🎵 ${msg}`);
    speak(msg.replace(/[⏸▶⏭⏮]/g,""));
    logActivity(`Spotify: ${action}`);
  }catch(err){ addChat("system",`Spotify control error: ${err.message||err}`); }
}

async function spotifySetVolume(vol){
  try{
    const token = await ensureSpotify();
    await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`,{
      method:"PUT", headers:{ Authorization:`Bearer ${token}` }
    });
    addChat("assistant",`🔊 Volume set to ${vol}%`);
    speak(`Volume set to ${vol} percent.`);
  }catch(err){ addChat("system",`Volume error: ${err.message}`); }
}

let _spotifyVol = 80;
function spotifyVolumeUp(){   _spotifyVol=Math.min(100,_spotifyVol+10); spotifySetVolume(_spotifyVol); }
function spotifyVolumeDown(){ _spotifyVol=Math.max(0,  _spotifyVol-10); spotifySetVolume(_spotifyVol); }

async function spotifyNowPlaying(){
  try{
    const token = await ensureSpotify();
    const res   = await fetch("https://api.spotify.com/v1/me/player/currently-playing",{
      headers:{ Authorization:`Bearer ${token}` }
    });
    if(res.status===204){ addChat("assistant","🎵 Nothing is currently playing on Spotify."); return; }
    const d       = await res.json();
    const track   = d.item;
    if(!track){     addChat("assistant","🎵 No track info available."); return; }
    const name    = track.name;
    const artist  = track.artists?.[0]?.name||"";
    const album   = track.album?.name||"";
    const cover   = track.album?.images?.[0]?.url||"";
    const prog    = Math.round((d.progress_ms||0)/1000);
    const dur     = Math.round((track.duration_ms||0)/1000);
    const fmtSec  = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
    const html    = `🎵 <b>Now Playing:</b><br>
<div style="display:flex;gap:10px;align-items:center;margin-top:6px">
  ${cover?`<img src="${cover}" style="width:48px;height:48px;border-radius:5px">`:""}
  <div><div style="font-weight:700;color:#1ed760">${name}</div><div style="color:var(--t2);font-size:12px">${artist} · ${album}</div><div style="color:var(--t2);font-size:11px;margin-top:2px">${fmtSec(prog)} / ${fmtSec(dur)}</div></div>
</div>`;
    addChat("assistant", html);
    speak(`Currently playing: ${name} by ${artist}.`);
  }catch(err){ addChat("system",`Now playing error: ${err.message}`); }
}

function updateSpotifyUI(playerState){
  const bar    = document.getElementById("nowPlayingBar");
  const track  = playerState?.track_window?.current_track;
  const paused = playerState?.paused;
  if(track && bar){
    document.getElementById("npTrack").textContent  = track.name||"—";
    document.getElementById("npArtist").textContent = track.artists?.[0]?.name||"";
    document.getElementById("npPlayBtn").textContent = paused ? "▶" : "⏸";
    bar.style.display = "flex";
    bar.style.flexDirection = "column";
  }
  if(track) logActivity(`♫ ${track.name} — ${track.artists?.[0]?.name||""}`);
}

// ═══════════════════════════════════════════════════════════════
//  ⑥ WHATSAPP MESSAGE READER
//  WhatsApp does NOT provide a public API for reading messages
//  from a web page. The best we can do without violating ToS:
//  — Open WhatsApp Web in a new tab (user reads it there)
//  — Read messages from a local QR-paired WhatsApp Web session
//    if Maximus is served via a Node.js backend (not possible
//    from a pure browser)
//  — For voice reading: user copies text → Maximus reads aloud
// ═══════════════════════════════════════════════════════════════

function whatsappOpenReader(contact){
  // Best we can do from browser: open WhatsApp Web chat
  const found = findContact(contact);
  if(found&&found.phone){
    const digits = found.phone.replace(/\D/g,"");
    openURL(`https://web.whatsapp.com/send?phone=${digits}`);
    addChat("assistant",`💬 Opened WhatsApp Web for <b>${found.name}</b>.<br>
<div style="background:rgba(37,211,102,.06);border:1px solid rgba(37,211,102,.2);border-radius:8px;padding:10px;margin-top:6px;font-size:13px">
📋 <b>To have Maximus read messages aloud:</b><br>
1. Copy the message text in WhatsApp Web<br>
2. Paste it here and say <b>"read this"</b><br>
— or —<br>
Paste text into the chat box and I'll summarise or reply.
</div>`);
    speak(`WhatsApp Web opened for ${found.name}. Copy and paste any messages here and I'll read or summarise them for you.`);
  } else {
    openURL("https://web.whatsapp.com");
    addChat("assistant",`💬 WhatsApp Web opened.<br>Copy any message and paste it here — I'll read it aloud or help you reply.`);
    speak("WhatsApp Web is open. Copy any message and paste it here.");
  }
}

function findContact(name){
  if(!name) return null;
  const lo = name.toLowerCase().trim();
  return state.contacts.find(c=>c.name.toLowerCase()===lo)
      || state.contacts.find(c=>c.name.toLowerCase().includes(lo)||lo.includes(c.name.toLowerCase()))
      || state.contacts.find(c=>c.name.toLowerCase().startsWith(lo.split(" ")[0]));
}

// "Read aloud" — user pastes WhatsApp text, Maximus reads and summarises
async function readPastedMessage(text){
  const tid = addChat("assistant","💬 Reading message…",true);
  const summary = await callMistral(`The user has pasted a WhatsApp/message conversation. Please:
1. Summarise what was said in 2-3 sentences
2. Identify who said what if clear
3. Note if any action or reply is needed
4. Suggest a brief reply if appropriate

Message content:
${text}`);
  updateChat(tid, fmtText(summary));
  speak(summary.replace(/<[^>]+>/g," ").substring(0,400));
  logActivity("Read WhatsApp message");
}

// ═══════════════════════════════════════════════════════════════
//  ⑦ WIRE EVERYTHING INTO detectAction + runAction
// ═══════════════════════════════════════════════════════════════

// Extend detectAction by monkey-patching
const _detectActionOrig = detectAction;
window.detectAction = function(text){
  const existing = _detectActionOrig(text);
  if(existing) return existing;
  const t = text.toLowerCase().trim();

  // SPOTIFY CONTROLS (voice commands for real API)
  if(/pause\s+(?:spotify|music|song|playback)|stop\s+(?:music|spotify|playing)/i.test(t)) return{type:"sp_control",action:"pause"};
  if(/resume\s+(?:spotify|music)|unpause|continue\s+(?:music|playing)/i.test(t))         return{type:"sp_control",action:"play"};
  if(/(?:next|skip)\s+(?:song|track|music)|skip\s+this/i.test(t))                        return{type:"sp_control",action:"next"};
  if(/(?:previous|prev|back|last)\s+(?:song|track)/i.test(t))                            return{type:"sp_control",action:"prev"};
  if(/(?:volume\s+up|louder|increase\s+volume)/i.test(t))                                return{type:"sp_vol",dir:"up"};
  if(/(?:volume\s+down|quieter|softer|decrease\s+volume)/i.test(t))                      return{type:"sp_vol",dir:"down"};
  const volM = t.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)(?:\s*%)?/i);
  if(volM)                                                                                 return{type:"sp_vol",val:parseInt(volM[1])};
  if(/what(?:'s| is)?\s+(?:playing|current(?:ly)?|the song|this song)/i.test(t))         return{type:"sp_now"};
  if(/(?:connect|setup|link|sign in)\s+(?:to\s+)?spotify/i.test(t))                      return{type:"sp_connect"};

  // GMAIL (real API)
  if(/(?:read|check|show|fetch)\s+(?:my\s+)?(?:emails?|inbox|gmail|messages?)/i.test(t)||/unread\s+emails?|new\s+emails?/i.test(t)){
    const fromM = t.match(/(?:emails?\s+from|from)\s+(\S+)/i);
    return{type:"gmail_real", from:fromM?fromM[1]:""};
  }

  // CALENDAR (real API)
  const calRAddM = t.match(/(?:add|create|schedule|book|set up)\s+(?:a\s+)?(?:meeting|event|appointment|call|reminder|standup|interview)\s+(.+)/i);
  if(calRAddM) return{type:"cal_real_add", details:calRAddM[1].trim()};
  if(/(?:show|read|what(?:'s| is)|tell me)\s+(?:my\s+)?(?:schedule|calendar|events?|agenda|meetings?)/i.test(t)){
    const w = t.includes("tomorrow")?"tomorrow":t.includes("week")?"this week":"today";
    return{type:"cal_real_view", when:w};
  }

  // SMART MEMORY
  if(/what have you learned|my habits|my patterns|what do you know about me/i.test(t)) return{type:"show_patterns"};

  // WHATSAPP READER
  if(/read\s+(?:my\s+)?whatsapp|open\s+whatsapp\s+(?:for|with|chat)\s+(.+)/i.test(t)){
    const m = t.match(/(?:open\s+whatsapp\s+(?:for|with|chat)\s+)(.+)/i);
    return{type:"wa_reader", contact:m?m[1].trim():""};
  }

  // READ PASTED MESSAGE
  if(/read\s+this|summarise\s+this\s+message|what\s+does\s+this\s+say/i.test(t)) return{type:"read_msg", text};

  return null;
};

// Extend runAction
const _runActionOrig = runAction;
window.runAction = async function(action, orig){
  switch(action.type){
    case "sp_control": await spotifyControl(action.action); break;
    case "sp_vol":
      if(action.val!=null) await spotifySetVolume(action.val);
      else if(action.dir==="up")   spotifyVolumeUp();
      else                         spotifyVolumeDown();
      break;
    case "sp_now":     await spotifyNowPlaying();  break;
    case "sp_connect":
      try{ await spotifySignIn(); addChat("assistant","✅ Spotify connected! Try: \"play Blinding Lights\""); }
      catch(e){ if(e!=="no_key"&&e!=="closed") addChat("system",`Spotify connect failed: ${e}`); }
      break;

    case "gmail_real": await gmailRead(action.from); break;
    case "cal_real_add":  await calendarAddReal(action.details); break;
    case "cal_real_view": await calendarReadReal(action.when);   break;

    case "show_patterns": showLearnedPatterns(); break;
    case "wa_reader":     whatsappOpenReader(action.contact); break;
    case "read_msg":      await readPastedMessage(action.text); break;

    default: return _runActionOrig(action, orig);
  }
};

// Override Spotify open in syncOpen for real API
const _syncOpenOrig = syncOpen;
window.syncOpen = function(action){
  // For real Spotify actions, syncOpen is a no-op (handled in runAction)
  if(["sp_control","sp_vol","sp_now","sp_connect"].includes(action.type)) return;
  // For legacy spotify type, attempt real API play
  if(action.type==="spotify"){
    spotifyPlay(action.song).catch(()=>openSpotify(action.song));
    return;
  }
  _syncOpenOrig(action);
};

// Also hook into processInput to:
// a) learn from every user input
// b) check for "read this" with clipboard/pasted content
const _processInputOrig = processInput;
window.processInput = async function(text){
  learnFromInput(text);  // ← learn from every interaction
  return _processInputOrig(text);
};

// ── Boot these new systems ──
window.addEventListener("DOMContentLoaded",()=>{
  loadBehavior();
  startPatternReminder();
  // Restore Spotify token if still valid
  const cached    = localStorage.getItem("sp_token");
  const cachedExp = parseInt(localStorage.getItem("sp_exp")||"0");
  if(cached && Date.now() < cachedExp){
    spotifyToken    = cached;
    spotifyTokenExp = cachedExp;
    initSpotifySDK();
  }
  logActivity("v10 features active: Memory/Calendar/Gmail/Spotify");
  // Handle Spotify PKCE callback (when page redirected back from Spotify)
  handleSpotifyCallback();
}, {once:true});


// ═══════════════════════════════════════════════════════════════
//  MAXIMUS v11 — THREE NEW FEATURES
//  ① Image Generation  (Pollinations AI — FREE, no key needed)
//  ② Auto Meeting Notes (live mic transcription → AI notes)
//  ③ Real-Time Translation (any language, voice in/out)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  ① IMAGE GENERATION — Pollinations AI (totally free, no key)
//  API: https://image.pollinations.ai/prompt/{prompt}?params
//  Supports: portraits, landscapes, logos, wallpapers, art styles
//  Models: flux (photorealistic), turbo (fast), anime, etc.
// ═══════════════════════════════════════════════════════════════

const IMG_MODELS = {
  default:     "flux",
  photo:       "flux",
  realistic:   "flux",
  fast:        "turbo",
  anime:       "flux-anime",
  logo:        "flux",
  wallpaper:   "flux",
  art:         "flux-realism",
  cartoon:     "flux-anime",
  portrait:    "flux",
  landscape:   "flux-realism",
};

// Enhance the user's prompt with AI before generating
async function enhanceImagePrompt(raw){
  try{
    const enhanced = await callMistral(
      `You are a Stable Diffusion prompt engineer. Take this request and write a SINGLE detailed image generation prompt (max 120 words). Include: subject, style, lighting, colors, mood, camera angle, quality tags. DO NOT add any explanation — just the prompt.\n\nRequest: "${raw}"`
    );
    return enhanced.replace(/^["']|["']$/g,"").trim();
  }catch(e){ return raw; }
}

// Pick the right model based on keywords in the prompt
function pickImgModel(text){
  const t = text.toLowerCase();
  if(/anime|manga|cartoon|illustration/i.test(t))  return IMG_MODELS.anime;
  if(/logo|icon|brand|emblem|badge/i.test(t))       return IMG_MODELS.logo;
  if(/wallpaper|desktop|background/i.test(t))       return IMG_MODELS.wallpaper;
  if(/photo|realistic|photograph|real/i.test(t))    return IMG_MODELS.realistic;
  if(/fast|quick|simple/i.test(t))                  return IMG_MODELS.fast;
  return IMG_MODELS.default;
}

async function generateImage(prompt, style=""){
  const tid = addChat("assistant",
    `<div class="img-generating">
      <div class="img-gen-orb"></div>
      <div>
        <div style="font-weight:700;color:var(--c);margin-bottom:4px">🎨 Generating image…</div>
        <div style="font-size:12px;color:var(--t2)">Enhancing prompt with AI, then rendering…</div>
      </div>
    </div>`, true);

  speak("Generating your image now, sir.");
  logActivity(`Image gen: ${prompt.substring(0,40)}`);

  try{
    // Step 1: Enhance prompt with AI
    const fullPrompt = style ? `${prompt}, ${style} style` : prompt;
    const enhanced   = await enhanceImagePrompt(fullPrompt);

    // Step 2: Pick model
    const model = pickImgModel(fullPrompt);

    // Step 3: Build Pollinations URL
    // Multiple resolutions available: default 1024x1024
    const w = fullPrompt.toLowerCase().includes("wallpaper") ? 1920 :
              fullPrompt.toLowerCase().includes("portrait")  ? 768  : 1024;
    const h = fullPrompt.toLowerCase().includes("wallpaper") ? 1080 :
              fullPrompt.toLowerCase().includes("portrait")  ? 1024 : 1024;

    const seed = Math.floor(Math.random()*999999);
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}?model=${model}&width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=false`;

    // Step 4: Preload image then show
    const imgEl = new Image();
    imgEl.onload = ()=>{
      const html = `
<div class="img-result-wrap">
  <div class="img-result-header">
    <span class="img-result-label">🎨 Generated Image</span>
    <div class="img-result-actions">
      <button class="img-action-btn" onclick="downloadImage('${url}','maximus_art_${seed}.jpg')" title="Download">⬇ Download</button>
      <button class="img-action-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','${style}')" title="Regenerate with new seed">🔄 Regenerate</button>
      <button class="img-action-btn" onclick="setAsBackground('${url}')" title="Set as Maximus background">🖼 Set BG</button>
    </div>
  </div>
  <img src="${url}" class="img-result" alt="${prompt}" loading="lazy"
       onclick="openImageFullscreen('${url}')"
       onerror="this.parentElement.innerHTML='<div style=\\'color:var(--err);padding:12px\\'>⚠️ Image generation failed. Try again.</div>'"/>
  <div class="img-prompt-shown">
    <span style="color:var(--t2);font-size:11px">Enhanced prompt:</span><br>
    <span style="font-size:12px;color:var(--t1)">${enhanced.substring(0,200)}${enhanced.length>200?"…":""}</span>
  </div>
  <div class="img-variant-row">
    <span style="font-size:11px;color:var(--t2)">Try a style:</span>
    <button class="img-style-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','photorealistic, cinematic')">📸 Photo</button>
    <button class="img-style-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','anime, manga style')">🌸 Anime</button>
    <button class="img-style-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','oil painting, fine art')">🎭 Art</button>
    <button class="img-style-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','neon cyberpunk, dark')">🌆 Cyber</button>
    <button class="img-style-btn" onclick="generateImage('${prompt.replace(/'/g,"\\'").replace(/"/g,'\\"')}','minimalist, logo design')">◻ Logo</button>
  </div>
</div>`;
      updateChat(tid, html);
      speak("Image ready, sir.");
    };

    imgEl.onerror = ()=>{
      updateChat(tid, `⚠️ Image generation timed out. <button onclick="generateImage('${prompt.replace(/'/g,"\\'")}','${style}')" style="background:rgba(0,229,255,.1);border:1px solid var(--brd);border-radius:6px;color:var(--c);padding:4px 10px;cursor:pointer;font-size:12px">🔄 Try Again</button>`);
      speak("Image generation timed out. Please try again.");
    };

    // Start loading — Pollinations takes 5-15 seconds
    imgEl.src = url;

  }catch(err){
    updateChat(tid, `Image generation failed: ${err.message}`);
    speak("Image generation failed.");
  }
}

function downloadImage(url, filename){
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.target="_blank";
  a.click();
  addChat("system","⬇ Download started.");
}

function setAsBackground(url){
  document.body.style.backgroundImage = `url('${url}')`;
  document.body.style.backgroundSize  = "cover";
  document.body.style.backgroundAttachment = "fixed";
  document.querySelector(".bg-grid").style.opacity = "0.4";
  addChat("system","🖼 Background updated! Refresh page to reset.");
  speak("Background updated, sir.");
}

function openImageFullscreen(url){
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px)";
  ov.onclick = ()=>document.body.removeChild(ov);
  const img = document.createElement("img");
  img.src = url;
  img.style.cssText = "max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 0 60px rgba(0,229,255,.2)";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:20px;right:24px;background:none;border:none;color:#fff;font-size:28px;cursor:pointer;opacity:.7";
  closeBtn.onclick = ()=>document.body.removeChild(ov);
  ov.appendChild(img); ov.appendChild(closeBtn);
  document.body.appendChild(ov);
}

// Detect what the user wants to generate — style hints
function parseImageRequest(text){
  const t = text.toLowerCase();
  const styleMap = [
    [/wallpaper|desktop background/i,       "ultrawide wallpaper, 4K quality"],
    [/logo|icon|brand|startup/i,            "minimalist logo design, clean vector, white background"],
    [/portrait|selfie|headshot/i,           "professional portrait, studio lighting"],
    [/anime|manga/i,                        "anime style, vibrant colors, detailed"],
    [/cyberpunk|neon|futuristic/i,          "cyberpunk style, neon lights, dark atmosphere"],
    [/oil paint|painting|artwork/i,         "oil painting, fine art, masterpiece"],
    [/realistic|photo|photograph/i,         "photorealistic, DSLR photo, sharp"],
    [/3d|render/i,                          "3D render, octane render, studio lighting"],
    [/watercolor/i,                         "watercolor painting, soft colors, artistic"],
    [/sketch|drawing|pencil/i,              "pencil sketch, detailed linework"],
  ];
  for(const [re,style] of styleMap){
    if(re.test(t)) return style;
  }
  return "";
}

// Strip "generate/draw/create/make/paint/design/show me" prefix
function cleanImagePrompt(text){
  return text
    .replace(/^(?:maximus\s+)?(?:generate|draw|create|make|paint|design|show me|imagine|render|illustrate|sketch)\s+(?:a\s+|an\s+|me\s+a\s+|me\s+an\s+)?/i,"")
    .replace(/\s+(?:for me|please|now|quickly|fast)$/i,"")
    .trim();
}

// ═══════════════════════════════════════════════════════════════
//  ② AUTO MEETING NOTES
//  Flow: "start meeting" → continuous transcription via Web Speech
//        "end meeting"   → AI structures notes → downloadable
//  Captures: everything said → timestamps → AI generates:
//  - Executive summary
//  - Key decisions
//  - Action items with owners
//  - Questions raised
//  - Full timestamped transcript
// ═══════════════════════════════════════════════════════════════

const meeting = {
  active:    false,
  startTime: null,
  transcript:[],   // [{ts, text}]
  rec:       null, // separate SpeechRecognition instance
  chatMsgId: null, // live transcript chat bubble
  ticker:    null, // interval for live counter
};

function meetingStart(){
  if(meeting.active){ addChat("system","⚠️ Meeting already in progress."); return; }

  meeting.active    = true;
  meeting.startTime = Date.now();
  meeting.transcript= [];

  // Live counter in topbar-style message
  const tid = addChat("assistant",buildMeetingStatusHTML(0,0), true);
  meeting.chatMsgId = tid;

  // Tick every second — update elapsed time
  meeting.ticker = setInterval(()=>{
    const secs = Math.floor((Date.now()-meeting.startTime)/1000);
    const lines = meeting.transcript.length;
    const el    = document.getElementById(`chat-${tid}`)?.querySelector("span");
    if(el) el.innerHTML = buildMeetingStatusHTML(secs, lines);
  },1000);

  // Launch a dedicated speech recognition loop for meeting
  meetingStartRec();

  speak("Meeting started, sir. I'm recording everything. Say 'end meeting' or 'meeting done' when finished.");
  logActivity("Meeting started");
  fireNotification("MAXIMUS Meeting", "Recording started — say 'end meeting' when done.", "📝");
}

function buildMeetingStatusHTML(secs, lines){
  const m = Math.floor(secs/60), s = secs%60;
  const time = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `<div class="meeting-status-bar">
    <div class="meeting-rec-dot"></div>
    <span class="meeting-status-label">● RECORDING MEETING</span>
    <span class="meeting-timer">${time}</span>
    <span class="meeting-lines">${lines} lines captured</span>
    <button onclick="meetingEnd()" class="meeting-end-btn">⏹ End Meeting</button>
  </div>`;
}

function meetingStartRec(){
  if(!window.SpeechRecognition && !window.webkitSpeechRecognition){ addChat("system","⚠️ Speech recognition not supported."); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  meeting.rec = new SR();
  meeting.rec.continuous     = true;
  meeting.rec.interimResults = true;
  meeting.rec.lang           = state.lang || "en-IN";
  meeting.rec.maxAlternatives= 1;

  let lastFinal = "";
  meeting.rec.onresult = e=>{
    let interim="", final="";
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) final  += e.results[i][0].transcript+" ";
      else                      interim+= e.results[i][0].transcript;
    }
    if(final.trim() && final.trim()!==lastFinal){
      lastFinal = final.trim();
      const ts  = Math.floor((Date.now()-meeting.startTime)/1000);
      const min = Math.floor(ts/60), sec = ts%60;
      const timeStr = `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

      // Check for end meeting command in transcription
      if(/end meeting|meeting done|stop meeting|finish meeting|meeting over/i.test(final)){
        meetingEnd(); return;
      }

      meeting.transcript.push({ ts:timeStr, text:final.trim() });
      logActivity(`Meeting: ${final.trim().substring(0,40)}…`);
    }
  };

  meeting.rec.onerror = e=>{
    if(e.error==="no-speech"||e.error==="aborted") return;
    if(meeting.active) setTimeout(meetingStartRec, 500); // restart on error
  };

  meeting.rec.onend = ()=>{ if(meeting.active) setTimeout(meetingStartRec,200); };
  try{ meeting.rec.start(); }catch(e){ setTimeout(meetingStartRec,300); }
}

async function meetingEnd(){
  if(!meeting.active){ addChat("system","No meeting in progress."); return; }

  meeting.active = false;
  clearInterval(meeting.ticker);
  try{ meeting.rec?.stop(); }catch(e){}

  const duration = Math.floor((Date.now()-meeting.startTime)/1000);
  const mins     = Math.floor(duration/60), secs=duration%60;
  const lines    = meeting.transcript.length;

  if(lines<2){
    addChat("system","⚠️ Not enough was captured to generate notes. Make sure your microphone is working and voices are audible.");
    speak("Not enough was recorded. Please check your microphone.");
    return;
  }

  const tid = addChat("assistant",`📝 Meeting ended (${mins}m ${secs}s, ${lines} lines). Generating structured notes…`,true);
  speak("Meeting ended. Generating your notes now, sir.");
  logActivity(`Meeting ended: ${mins}m, ${lines} lines`);

  // Build full transcript text
  const transcriptText = meeting.transcript
    .map(t=>`[${t.ts}] ${t.text}`)
    .join("\n");

  try{
    // AI generates structured meeting notes
    const notes = await callMistral(
      `You are a professional meeting secretary. Analyse this meeting transcript and generate comprehensive, well-structured meeting notes.

MEETING TRANSCRIPT:
${transcriptText}

Generate the notes in this exact structure:
## 📋 Meeting Summary
(2-3 sentence overview of what the meeting was about)

## ✅ Key Decisions Made
(bullet list of decisions reached)

## 📌 Action Items
(bullet list: what needs to be done, who mentioned it if clear, implied deadline)

## ❓ Questions Raised
(unanswered questions or topics needing follow-up)

## 💡 Key Points Discussed
(main topics and discussion points)

## 📝 Full Transcript
${transcriptText}

Be thorough, professional, and accurate. Infer context from what was said.`
    );

    // Build rich display
    const html = `
<div class="meeting-notes-wrap">
  <div class="meeting-notes-header">
    <div>
      <div class="meeting-notes-title">📝 Meeting Notes</div>
      <div class="meeting-notes-meta">${new Date(meeting.startTime).toLocaleString("en-IN")} · ${mins}m ${secs}s · ${lines} transcript lines</div>
    </div>
    <div class="meeting-notes-actions">
      <button class="img-action-btn" onclick="downloadMeetingNotes()" title="Download as text file">⬇ Download</button>
      <button class="img-action-btn" onclick="copyMeetingNotes()" title="Copy to clipboard">📋 Copy</button>
    </div>
  </div>
  <div class="meeting-notes-body" id="meetingNotesBody">${fmtText(notes)}</div>
</div>`;

    // Store notes for download/copy
    window._lastMeetingNotes   = notes;
    window._lastMeetingTitle   = `Meeting_${new Date(meeting.startTime).toISOString().slice(0,16).replace("T","_")}`;
    window._lastTranscriptText = transcriptText;

    updateChat(tid, html);
    speak("Meeting notes are ready, sir. I've captured the key decisions, action items, and a full summary.");

  }catch(err){
    updateChat(tid,`Notes generation failed: ${err.message}. Here is the raw transcript:\n\n${transcriptText}`);
    speak("AI notes generation failed, but the raw transcript has been saved.");
  }
}

function downloadMeetingNotes(){
  const content = `MAXIMUS MEETING NOTES\n${"=".repeat(50)}\nDate: ${new Date().toLocaleString("en-IN")}\n\n${window._lastMeetingNotes||""}\n\nRAW TRANSCRIPT:\n${window._lastTranscriptText||""}`;
  const blob = new Blob([content],{type:"text/plain"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`${window._lastMeetingTitle||"meeting"}_notes.txt`;
  a.click(); URL.revokeObjectURL(url);
  addChat("system","⬇ Meeting notes downloaded.");
}

function copyMeetingNotes(){
  navigator.clipboard.writeText(window._lastMeetingNotes||"").then(()=>addChat("system","📋 Meeting notes copied to clipboard."));
}

// ═══════════════════════════════════════════════════════════════
//  ③ REAL-TIME TRANSLATION
//  Two modes:
//  A) One-shot: "Translate 'hello world' to French" → translates + speaks
//  B) Live mode: "Translate everything I say to Hindi" → mic input in
//     any language → Maximus speaks translation in target language
//     Say "stop translating" to end live mode
// ═══════════════════════════════════════════════════════════════

const LANG_FULL = {
  hindi:"hi-IN", hindi:"hi-IN", "hi":"hi-IN",
  tamil:"ta-IN", telugu:"te-IN", kannada:"kn-IN",
  malayalam:"ml-IN", marathi:"mr-IN", gujarati:"gu-IN",
  bengali:"bn-IN", punjabi:"pa-IN", urdu:"ur-IN",
  english:"en-IN", french:"fr-FR", spanish:"es-ES",
  german:"de-DE", italian:"it-IT", portuguese:"pt-BR",
  arabic:"ar-SA", japanese:"ja-JP", korean:"ko-KR",
  chinese:"zh-CN", mandarin:"zh-CN", russian:"ru-RU",
  dutch:"nl-NL", turkish:"tr-TR", polish:"pl-PL",
  vietnamese:"vi-VN", thai:"th-TH", greek:"el-GR",
  hebrew:"he-IL", indonesian:"id-ID", malay:"ms-MY",
  swahili:"sw-KE", farsi:"fa-IR", persian:"fa-IR",
  ukrainian:"uk-UA", czech:"cs-CZ", romanian:"ro-RO",
};

const LANG_NAMES = {
  "hi-IN":"Hindi","ta-IN":"Tamil","te-IN":"Telugu","kn-IN":"Kannada",
  "ml-IN":"Malayalam","mr-IN":"Marathi","gu-IN":"Gujarati","bn-IN":"Bengali",
  "pa-IN":"Punjabi","ur-IN":"Urdu","en-IN":"English","en-US":"English",
  "fr-FR":"French","es-ES":"Spanish","de-DE":"German","it-IT":"Italian",
  "pt-BR":"Portuguese","ar-SA":"Arabic","ja-JP":"Japanese","ko-KR":"Korean",
  "zh-CN":"Chinese","ru-RU":"Russian","nl-NL":"Dutch","tr-TR":"Turkish",
  "pl-PL":"Polish","vi-VN":"Vietnamese","th-TH":"Thai","el-GR":"Greek",
};

const xlate = {
  live:       false,
  targetLang: "hi-IN",
  targetName: "Hindi",
  rec:        null,
  chatMsgId:  null,
  count:      0,
};

function resolveLang(name){
  const lo = name.toLowerCase().trim();
  // Direct code match
  if(Object.values(LANG_FULL).includes(lo)) return lo;
  // Name match
  for(const [k,v] of Object.entries(LANG_FULL)){
    if(lo===k || lo.includes(k) || k.includes(lo)) return v;
  }
  return "hi-IN"; // fallback
}

// One-shot translation
async function translateOnce(text, targetLang, targetName){
  const tid = addChat("assistant",`🌍 Translating to <b>${targetName}</b>…`,true);
  try{
    const reply = await callMistral(
      `Translate the following text to ${targetName}. Return ONLY the translated text — no explanation, no quotes, no extra words.\n\nText: "${text}"`
    );
    const html = `
<div class="xlate-result">
  <div class="xlate-header">
    <span class="xlate-flag">🌍</span>
    <span class="xlate-title">Translation → <b>${targetName}</b></span>
    <button class="xlate-speak-btn" onclick="speakInLang('${reply.replace(/'/g,"\\'").replace(/\n/g," ")}','${targetLang}')">🔊 Speak</button>
    <button class="xlate-copy-btn" onclick="navigator.clipboard.writeText('${reply.replace(/'/g,"\\'").replace(/\n/g," ")}').then(()=>addChat('system','📋 Copied.'))">📋</button>
  </div>
  <div class="xlate-original">
    <span style="font-size:11px;color:var(--t2)">Original:</span><br>
    <span style="font-size:14px">${text}</span>
  </div>
  <div class="xlate-translated">
    <span style="font-size:11px;color:var(--c)">In ${targetName}:</span><br>
    <span style="font-size:16px;font-weight:600;color:#fff">${reply}</span>
  </div>
</div>`;
    updateChat(tid, html);
    // Auto-speak translated text
    speakInLang(reply, targetLang);
    logActivity(`Translated → ${targetName}`);
  }catch(err){
    updateChat(tid,`Translation failed: ${err.message}`);
  }
}

// Speak in a specific language (temporarily overrides voice lang)
function speakInLang(text, lang){
  if(!state.synth) return;
  state.synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g," ").substring(0,500));
  u.lang   = lang;
  u.rate   = 0.95;
  u.pitch  = 0.88;
  u.volume = 1;
  const voices = state.synth.getVoices();
  const lb = lang.split("-")[0];
  const v  = voices.find(v=>v.lang===lang)
           ||voices.find(v=>v.lang.startsWith(lb))
           ||voices.find(v=>v.lang.startsWith("en"));
  if(v) u.voice=v;
  state.synth.speak(u);
}

// Live translation mode — every sentence the user speaks gets translated
function startLiveTranslation(targetLang, targetName){
  if(xlate.live){ addChat("system","Translation mode already active. Say 'stop translating' to end it."); return; }

  xlate.live       = true;
  xlate.targetLang = targetLang;
  xlate.targetName = targetName;
  xlate.count      = 0;

  // Pause main Maximus recognizer
  if(state.rec){ try{state.rec.abort();}catch(e){} state.recRunning=false; }

  const tid = addChat("assistant",`
<div class="xlate-live-bar">
  <div class="xlate-live-dot"></div>
  <span>🌍 <b>Live Translation Mode</b> — speak in any language → translated to <b>${targetName}</b></span>
  <button onclick="stopLiveTranslation()" class="meeting-end-btn" style="margin-left:auto">⏹ Stop</button>
</div>
<div id="xlate-live-feed" class="xlate-live-feed"></div>`, true);
  xlate.chatMsgId = tid;

  speak(`Live translation mode active. Everything you say will be translated to ${targetName}. Say stop translating to end.`);
  logActivity(`Live translation: → ${targetName}`);

  xlateStartRec();
}

function xlateStartRec(){
  if(!xlate.live) return;
  const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ addChat("system","Speech recognition not supported."); return; }

  xlate.rec = new SR();
  xlate.rec.continuous     = false; // single utterance — cleaner for translation
  xlate.rec.interimResults = true;
  xlate.rec.lang           = ""; // empty = accept any language
  xlate.rec.maxAlternatives= 1;

  let interim_el_id = `xlate-interim-${Date.now()}`;

  xlate.rec.onstart = ()=>{
    const feed = document.getElementById("xlate-live-feed");
    if(feed){
      const row = document.createElement("div");
      row.className = "xlate-live-row";
      row.id = interim_el_id;
      row.innerHTML = `<span class="xlate-interim">…</span>`;
      feed.appendChild(row);
      feed.scrollTop = feed.scrollHeight;
    }
  };

  xlate.rec.onresult = async e=>{
    let interim="", final="";
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) final  +=e.results[i][0].transcript+" ";
      else                      interim+=e.results[i][0].transcript;
    }
    // Update interim
    const el = document.getElementById(interim_el_id);
    if(el && interim) el.querySelector(".xlate-interim").textContent = interim;

    if(final.trim()){
      if(/stop translat|end translat|stop mode/i.test(final)){
        stopLiveTranslation(); return;
      }
      if(el) el.querySelector(".xlate-interim").style.color="var(--t2)";
      try{
        const translated = await callMistral(
          `Translate to ${xlate.targetName}. Return ONLY the translation, nothing else.\nText: "${final.trim()}"`
        );
        if(el){
          xlate.count++;
          el.innerHTML = `
<div class="xlate-pair">
  <div class="xlate-orig">${final.trim()}</div>
  <div class="xlate-trans">→ ${translated} <button onclick="speakInLang('${translated.replace(/'/g,"\\'").replace(/\n/g," ")}','${xlate.targetLang}')" style="background:none;border:none;cursor:pointer;color:var(--c);font-size:11px">🔊</button></div>
</div>`;
          const feed = document.getElementById("xlate-live-feed");
          if(feed) feed.scrollTop = feed.scrollHeight;
        }
        speakInLang(translated, xlate.targetLang);
      }catch(err){
        if(el) el.innerHTML = `<div style="color:var(--err);font-size:12px">Translation error</div>`;
      }
    }
  };

  xlate.rec.onerror = e=>{ if(xlate.live&&e.error!=="aborted") setTimeout(xlateStartRec,300); };
  xlate.rec.onend   = ()=>{ if(xlate.live) setTimeout(xlateStartRec,100); };
  try{ xlate.rec.start(); }catch(e){ setTimeout(xlateStartRec,300); }
}

function stopLiveTranslation(){
  xlate.live = false;
  try{ xlate.rec?.stop(); xlate.rec?.abort(); }catch(e){}
  addChat("system",`🌍 Live translation stopped. ${xlate.count} sentences translated.`);
  speak("Translation mode ended.");
  logActivity(`Live translation ended: ${xlate.count} sentences`);
  // Resume main Maximus rec
  if(state.isAwake){ try{state._startRec&&state._startRec();}catch(e){} }
}

// ═══════════════════════════════════════════════════════════════
//  WIRE INTO detectAction + runAction (clean extension)
// ═══════════════════════════════════════════════════════════════

const _detectV11Orig = window.detectAction || detectAction;
window.detectAction = function(text){
  const existing = _detectV11Orig(text);
  if(existing) return existing;
  const t = text.toLowerCase().trim();

  // ── IMAGE GENERATION ──
  const imgRe = /^(?:generate|draw|create|make|paint|design|show me|imagine|render|illustrate|sketch)\b/i;
  if(imgRe.test(t) && !/(code|script|program|email|meeting|alarm|reminder)/i.test(t)){
    return { type:"gen_image", prompt:text };
  }
  // "Maximus draw me a …" / "Create an image of …"
  if(/\b(?:an? image of|a picture of|a photo of|a drawing of|a painting of|a wallpaper of|a logo for|a wallpaper)\b/i.test(t)){
    return { type:"gen_image", prompt:text };
  }

  // ── MEETING NOTES ──
  if(/start(?:ing)?\s+(?:a\s+)?meeting|begin(?:ning)?\s+(?:a\s+)?meeting|meeting\s+start/i.test(t))
    return { type:"meeting_start" };
  if(/end(?:ing)?\s+(?:the\s+)?meeting|meeting\s+(?:done|over|end|finished|stop)|stop\s+(?:the\s+)?meeting|finish\s+(?:the\s+)?meeting/i.test(t))
    return { type:"meeting_end" };
  if(/meeting\s+notes|show\s+(?:my\s+)?(?:meeting|notes)/i.test(t))
    return { type:"meeting_notes" };

  // ── TRANSLATION ──
  // One-shot: "translate X to Y" or "translate X in Y"
  const xlateShotM = t.match(/translate\s+['"""]?(.+?)['"""]?\s+(?:to|in(?:to)?|in)\s+(\w+)/i);
  if(xlateShotM){
    const tgt = resolveLang(xlateShotM[2]);
    return { type:"xlate_once", text:xlateShotM[1].trim(), targetLang:tgt, targetName:LANG_NAMES[tgt]||xlateShotM[2] };
  }
  // "say X in Hindi"
  const sayInM = t.match(/(?:say|speak|tell me|how do you say)\s+['"""]?(.+?)['"""]?\s+in\s+(\w+)/i);
  if(sayInM){
    const tgt = resolveLang(sayInM[2]);
    return { type:"xlate_once", text:sayInM[1].trim(), targetLang:tgt, targetName:LANG_NAMES[tgt]||sayInM[2] };
  }
  // Live mode: "translate everything to Hindi" / "speak in Tamil"
  const xlateLiveM = t.match(/(?:translate everything|translate all|interpret|live translate|real.?time translate|keep translating|translate (?:me|my voice))\s+(?:to|in(?:to)?)\s+(\w+)/i)
                  || t.match(/(?:switch to|speak|talk)\s+in\s+(\w+)(?:\s+mode)?/i);
  if(xlateLiveM){
    const tgt = resolveLang(xlateLiveM[1]);
    return { type:"xlate_live", targetLang:tgt, targetName:LANG_NAMES[tgt]||xlateLiveM[1] };
  }
  // Stop live translation
  if(/stop translat|end translat|exit translat|stop (?:live |real.?time )?translat/i.test(t))
    return { type:"xlate_stop" };

  return null;
};

const _runV11Orig = window.runAction || runAction;
window.runAction = async function(action, orig){
  switch(action.type){

    case "gen_image":{
      const prompt = cleanImagePrompt(action.prompt||orig);
      const style  = parseImageRequest(action.prompt||orig);
      await generateImage(prompt, style);
      break;
    }

    case "meeting_start": meetingStart(); break;
    case "meeting_end":   await meetingEnd(); break;
    case "meeting_notes":
      if(window._lastMeetingNotes) addChat("assistant",`<div class="meeting-notes-wrap"><div class="meeting-notes-header"><div class="meeting-notes-title">📝 Last Meeting Notes</div></div><div class="meeting-notes-body">${fmtText(window._lastMeetingNotes)}</div></div>`);
      else addChat("system","No meeting notes available yet. Start a meeting first.");
      break;

    case "xlate_once":
      await translateOnce(action.text, action.targetLang, action.targetName);
      break;

    case "xlate_live":
      startLiveTranslation(action.targetLang, action.targetName);
      break;

    case "xlate_stop":
      stopLiveTranslation();
      break;

    default: return _runV11Orig(action, orig);
  }
};

// Also extend syncOpen (no URL to open for these new types)
const _syncV11Orig = window.syncOpen || syncOpen;
window.syncOpen = function(action){
  if(["gen_image","meeting_start","meeting_end","meeting_notes","xlate_once","xlate_live","xlate_stop"].includes(action.type)) return;
  _syncV11Orig(action);
};