import { rpc } from "./api.js";
import { state } from "./state.js";
import { showToast } from "./utils.js";

let peer = null, rec = null, stream = null, chunks = [], started = 0, timer = null, sx = 0, sy = 0, locked = false, cancelled = false;
const urls = new Map();
const I = {
  mic:'<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="m9 6 9 6-9 6z"/></svg>',
  pause:'<svg viewBox="0 0 24 24"><path d="M9 7v10M15 7v10"/></svg>',
  trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  send:'<svg viewBox="0 0 24 24"><path d="m3 11 17-8-7.5 18-2-7.5zM10.5 13.5 20 3"/></svg>',
  lock:'<svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>'
};
const fmt=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s))%60).padStart(2,'0')}`;

function setPeerFromEvent(e){
  const a=e.target.closest?.('[data-message-friend]'); if(a) peer={id:a.dataset.messageFriend,name:a.title?.replace(/^Написать\s+/,'')||''};
  const t=e.target.closest?.('[data-chat-friend]'); if(t) peer={id:t.dataset.chatFriend,name:t.dataset.chatName||''};
}
document.addEventListener('click',setPeerFromEvent,true);
function currentPeer(){
  if(peer?.id) return peer;
  const name=document.querySelector('#chat-layer .chat-peer b')?.textContent?.trim();
  const f=(state.friends||[]).find(x=>x.username===name||x.name===name);
  if(f) peer={id:f.id,name:f.username||f.name};
  return peer;
}
function mime(){ return ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported?.(x))||''; }
function stopTracks(){ stream?.getTracks().forEach(t=>t.stop()); stream=null; }
function recordingStrip(){
  document.querySelector('.voice-record-strip')?.remove();
  document.querySelector('.chat-composer')?.insertAdjacentHTML('beforebegin',`<div class="voice-record-strip"><span class="voice-record-dot"></span><b data-voice-clock>0:00</b><span class="voice-cancel-hint">‹ Сдвиньте для отмены</span><span class="voice-lock-hint">${I.lock} вверх</span></div>`);
  timer=setInterval(()=>{const n=document.querySelector('[data-voice-clock]');if(n)n.textContent=fmt((Date.now()-started)/1000)},200);
}
function clearUI(){ clearInterval(timer);timer=null;document.querySelector('.voice-record-strip')?.remove();const c=document.querySelector('.chat-composer');c?.classList.remove('voice-recording','voice-locked');c?.querySelector('.voice-lock-controls')?.remove(); }
function lockUI(){
  const c=document.querySelector('.chat-composer'); if(!c||c.querySelector('.voice-lock-controls'))return;
  c.classList.add('voice-locked');
  c.insertAdjacentHTML('beforeend',`<div class="voice-lock-controls"><button type="button" data-voice-cancel>${I.trash}</button><button type="button" data-voice-finish>${I.send}</button></div>`);
  c.querySelector('[data-voice-cancel]').onclick=()=>finish(true);
  c.querySelector('[data-voice-finish]').onclick=()=>finish(false);
  const h=document.querySelector('.voice-cancel-hint');if(h)h.textContent='Запись зафиксирована';document.querySelector('.voice-lock-hint')?.remove();
}
async function begin(e){
  if(rec)return; const p=currentPeer();if(!p?.id)return showToast('Не удалось определить собеседника');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return showToast('Запись голоса не поддерживается');
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const m=mime();rec=m?new MediaRecorder(stream,{mimeType:m,audioBitsPerSecond:64000}):new MediaRecorder(stream);
    chunks=[];locked=false;cancelled=false;sx=e.clientX||0;sy=e.clientY||0;started=Date.now();
    rec.ondataavailable=x=>{if(x.data?.size)chunks.push(x.data)};rec.onstop=finalize;rec.start(200);
    document.querySelector('.chat-composer')?.classList.add('voice-recording');recordingStrip();navigator.vibrate?.(12);
  }catch(err){console.error(err);stopTracks();rec=null;showToast('Не удалось получить доступ к микрофону')}
}
function move(e){
  if(!rec||locked)return;const dx=(e.clientX||0)-sx,dy=(e.clientY||0)-sy;const strip=document.querySelector('.voice-record-strip');if(strip)strip.style.setProperty('--drag',`${Math.min(0,dx)}px`);
  if(dx<-85){cancelled=true;finish(true)}else if(dy<-75){locked=true;lockUI();navigator.vibrate?.(16)}
}
function finish(discard=false){ if(!rec||rec.state==='inactive')return;cancelled=cancelled||discard;try{rec.stop()}catch{} }
function to64(blob){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=no;r.readAsDataURL(blob)})}
function bars(seed){let h=0;for(const c of String(seed))h=((h<<5)-h+c.charCodeAt(0))|0;return Array.from({length:32},(_,i)=>`<i style="--h:${(5+Math.abs(Math.sin((h+i*17)*.19))*20).toFixed(1)}px"></i>`).join('')}
function optimistic(duration){const m=document.querySelector('.chat-messages');if(!m)return null;m.querySelector('.chat-empty-conversation')?.remove();const b=document.createElement('article');b.className='chat-bubble outgoing voice-message is-sending';b.innerHTML=`<div class="voice-player"><button disabled>${I.play}</button><div class="voice-wave">${bars('send')}</div><span>${fmt(duration)}</span></div><div class="chat-message-meta">Отправка…</div>`;m.append(b);m.scrollTop=m.scrollHeight;return b}
async function finalize(){
  const old=rec,duration=(Date.now()-started)/1000;rec=null;stopTracks();clearUI();
  if(cancelled||duration<.35||!chunks.length){chunks=[];navigator.vibrate?.(8);return}
  const type=old?.mimeType||chunks[0]?.type||'audio/mp4',blob=new Blob(chunks,{type});chunks=[];const opt=optimistic(duration);
  try{const p=currentPeer(),base64=await to64(blob),ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';await rpc('upload_chat_media',{p_token:state.session.token,p_to:p.id,p_kind:'audio',p_body:String(Math.round(duration*1000)),p_media_mime:type,p_media_name:`voice-${Date.now()}.${ext}`,p_media_base64:base64});opt?.classList.remove('is-sending');if(opt?.querySelector('.chat-message-meta'))opt.querySelector('.chat-message-meta').textContent='Отправлено';navigator.vibrate?.(10)}catch(err){console.error(err);opt?.classList.add('is-failed');if(opt?.querySelector('.chat-message-meta'))opt.querySelector('.chat-message-meta').textContent='Ошибка отправки';showToast('Не удалось отправить голосовое сообщение')}
}
async function voiceURL(id){if(urls.has(id))return urls.get(id);const r=await rpc('get_chat_media_secure',{p_token:state.session.token,p_message_id:Number(id)}),row=Array.isArray(r)?r[0]:r;if(!row?.media_base64)throw Error('voice_not_found');const bin=atob(row.media_base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const u=URL.createObjectURL(new Blob([bytes],{type:row.media_mime||'audio/mp4'}));urls.set(id,u);return u}
async function hydrate(b){
  if(b.dataset.voiceReady)return;b.dataset.voiceReady='loading';const id=b.dataset.messageId,body=b.querySelector('.chat-message-text');let ms=0;if(body&&/^\d+$/.test(body.textContent.trim())){ms=Number(body.textContent.trim());body.remove()}const meta=b.querySelector('.chat-message-meta'),p=document.createElement('div');p.className='voice-player';p.innerHTML=`<button type="button" class="voice-play">${I.play}</button><div class="voice-wave">${bars(id)}</div><span class="voice-duration">${fmt(ms/1000)}</span>`;b.insertBefore(p,meta||b.firstChild);b.classList.add('voice-message');
  try{const a=new Audio(await voiceURL(id));a.preload='metadata';a.hidden=true;a.dataset.auroraVoice=id;b.append(a);const btn=p.querySelector('button'),wave=p.querySelector('.voice-wave'),label=p.querySelector('.voice-duration');a.onloadedmetadata=()=>{if(!ms&&isFinite(a.duration))label.textContent=fmt(a.duration)};a.ontimeupdate=()=>{const pc=a.duration?a.currentTime/a.duration*100:0;wave.style.setProperty('--voice-progress',`${pc}%`);label.textContent=fmt(a.currentTime)};a.onended=()=>{btn.innerHTML=I.play;wave.style.setProperty('--voice-progress','0%');label.textContent=fmt(a.duration||ms/1000)};btn.onclick=async()=>{document.querySelectorAll('audio[data-aurora-voice]').forEach(o=>{if(o!==a)o.pause()});if(a.paused){await a.play();btn.innerHTML=I.pause}else{a.pause();btn.innerHTML=I.play}};b.dataset.voiceReady='true'}catch(err){console.error(err);p.classList.add('voice-error');b.dataset.voiceReady='error'}
}
function decorate(){document.querySelectorAll('#chat-layer .chat-bubble[data-message-kind="audio"]').forEach(b=>hydrate(b))}
function install(){
  const c=document.querySelector('#chat-layer .chat-composer');if(!c||c.dataset.voiceV2)return;c.dataset.voiceV2='1';const send=c.querySelector('.chat-send'),input=c.querySelector('.chat-input');if(!send||!input)return;const mic=document.createElement('button');mic.type='button';mic.className='chat-voice-record';mic.setAttribute('aria-label','Удерживайте для записи голосового сообщения');mic.innerHTML=I.mic;send.after(mic);const sync=()=>{const text=!!input.value.trim();mic.hidden=text;send.hidden=!text};input.addEventListener('input',sync);sync();mic.addEventListener('pointerdown',e=>{e.preventDefault();mic.setPointerCapture?.(e.pointerId);begin(e)});mic.addEventListener('pointermove',move);mic.addEventListener('pointerup',()=>{if(rec&&!locked)finish(false)});mic.addEventListener('pointercancel',()=>{if(rec&&!locked)finish(true)});mic.addEventListener('contextmenu',e=>e.preventDefault())
}
function refresh(){install();decorate()}
new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});refresh();
