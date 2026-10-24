// Each page load begins a new visit; collection lives only in the current page.
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
if('scrollRestoration' in history)history.scrollRestoration='manual';
window.scrollTo(0,0);
const $=s=>document.querySelector(s);
const intro=$('#intro'),home=$('#home-scene'),coin=$('#coin'),knob=$('.knob-live'),outlet=$('#outlet-scene'),outletButton=$('#outlet-button'),capsule=$('#capsule'),tvButton=$('#tv-open-button'),chapters=$('#chapters'),track=$('#chapter-track'),readingShell=$('#reading-shell'),carouselControls=$('#carousel-controls');
const drawStrip=$('#draw-strip'),stripCoin=$('#strip-coin'),stripKnob=$('.strip-knob'),stripSlot=$('.strip-slot'),collection=$('#capsule-collection');
const cameraGallery=$('#camera-gallery'),cameraGalleryTrack=$('#camera-gallery-track'),cameraDrawStrip=$('#camera-draw-strip'),cameraStripCoin=$('#camera-strip-coin'),cameraStripKnob=$('.camera-strip-knob'),cameraStripSlot=$('.camera-strip-slot');
const noteGallery=$('#note-gallery'),noteDrawStrip=$('#note-draw-strip'),noteStripCoin=$('#note-strip-coin'),noteStripKnob=$('.note-strip-knob'),noteStripSlot=$('.note-strip-slot');
const modelGallery=$('#model-gallery');
const capsuleName=()=>({tv:'电视机',camera:'相机',note:'便利贴',robot:'机器人'}[currentCapsule]);
const chapterIds=["preparation", "production", "postproduction", "film", "epic-puppy", "epic-master", "epic-kitten", "epic-hoot", "epic-simone", "dino-bridge", "dino-grapes"];
let youtubeFrame=null;
const filmHost=$('#film-player'),filmStatus=$('#film-status');
let filmFrame=null;
let walkModule=null,walkImport=null;
let endingModule=null,endingImport=null,endingTicket=0;
const endingInertState=new Map();
let running=false,phase='idle',muted=false,ctx=null,generation=0,playing=[],scheduled=[],currentChapter=0,dragStartX=null,dragDelta=0,dragPointer=null,drawStripOpen=false,cameraStripOpen=false,noteStripOpen=false,stripRunning=false,currentCapsule='tv',currentCard=0,cardDragStart=null,cardDragDelta=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const animate=(node,frames,options)=>{const a=node.animate(frames,{fill:'forwards',...options});playing.push(a);return a.finished.catch(()=>{});};

function soundContext(){
  try{ctx??=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume()}catch{ctx=null}
}
function hit(time,pitch=260,gain=.09,duration=.12,type='triangle'){
  if(!ctx||muted)return;
  const osc=ctx.createOscillator(),amp=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(pitch,time);osc.frequency.exponentialRampToValueAtTime(Math.max(35,pitch*.44),time+duration);
  amp.gain.setValueAtTime(.0001,time);amp.gain.exponentialRampToValueAtTime(gain,time+.006);amp.gain.exponentialRampToValueAtTime(.0001,time+duration);
  osc.connect(amp).connect(ctx.destination);osc.start(time);osc.stop(time+duration+.02);scheduled.push(osc);
}
function noise(duration=.5,gainValue=.05,cutoff=1000,start=0){
  if(!ctx||muted)return;
  const count=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,count,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<count;i++)data[i]=(Math.random()*2-1)*(1-i/count);
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.value=gainValue;
  source.connect(filter).connect(gain).connect(ctx.destination);source.start(ctx.currentTime+start);scheduled.push(source);
}
function metalHit(time,pitch=280,gain=.07,duration=.18){
  hit(time,pitch,gain,duration,'triangle');hit(time+.006,pitch*2.55,gain*.42,duration*.58,'square');
}
function gearSound(){
  if(!ctx||muted)return;
  const now=ctx.currentTime;
  [0,.11,.22,.34,.47,.61,.76,.92,1.08,1.23].forEach((t,i)=>metalHit(now+t,500-(i%3)*62,.042,.09));
  noise(1.35,.04,680,0);
}
function capsuleTransitSound(){
  if(!ctx||muted)return;
  const now=ctx.currentTime;
  [0,.2,.43,.68,.94,1.18,1.4,1.6].forEach((t,i)=>metalHit(now+t,420-i*19,.055+i*.004,.15));
  noise(1.82,.095,1100,0);
  metalHit(now+1.78,245,.12,.24);
  noise(.28,.15,1450,1.8);
  hit(now+1.84,82,.2,.34,'triangle');
  hit(now+1.86,720,.09,.19,'square');
  hit(now+1.89,1380,.05,.12,'sine');
}
function hingeSound(){
  if(!ctx||muted)return;
  const now=ctx.currentTime;noise(.72,.065,520,0);metalHit(now,330,.05,.16);metalHit(now+.55,105,.11,.18);
}
function capsuleOpenSound(){
  if(!ctx||muted)return;
  const now=ctx.currentTime;metalHit(now,820,.055,.11);metalHit(now+.12,1180,.045,.18);noise(.55,.045,1500,.04);metalHit(now+.46,190,.09,.24);
}
function stopAudio(){scheduled.forEach(n=>{try{n.stop()}catch{}});scheduled=[]}

function unloadYouTubePlayer(){
  if(youtubeFrame){const screen=youtubeFrame.parentElement;youtubeFrame.remove();youtubeFrame=null;screen.querySelector('.video-poster').hidden=false}
}
function syncVideoProgram(){
  const id=chapterIds[currentChapter],active=phase==='reading'&&!chapters.hidden&&!drawStripOpen;
  if(!active||youtubeFrame?.closest('.chapter')?.id!==id)unloadYouTubePlayer();
  const project=id.startsWith('epic-')?'epic':id.startsWith('dino-')?'dino':'documentary';
  document.querySelectorAll('#video-project-nav a').forEach(a=>{if(active&&a.dataset.project===project)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});
  document.querySelectorAll('#chapter-track>.chapter').forEach(section=>{const visible=active&&section.id===id;section.inert=!visible;section.setAttribute('aria-hidden',String(!visible));if(visible)section.querySelectorAll('img[data-src]').forEach(img=>{img.src=img.dataset.src;delete img.dataset.src})});
}
document.querySelectorAll('.video-poster').forEach(button=>button.addEventListener('click',()=>{
  const screen=button.closest('.video-screen');
  if(phase!=='reading'||drawStripOpen||screen.closest('.chapter').id!==chapterIds[currentChapter])return;
  unloadYouTubePlayer();stopAudio();
  const frame=document.createElement('iframe');youtubeFrame=frame;
  const url=new URL('https://www.youtube-nocookie.com/embed/'+screen.dataset.video);
  url.search=new URLSearchParams({autoplay:'1',playsinline:'1',rel:'0',origin:location.origin}).toString();
  frame.src=url.href;frame.title=button.getAttribute('aria-label').replace('播放 ','')+' · YouTube 播放器';
  frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  button.hidden=true;screen.append(frame);frame.focus();
}));
function unloadFilmPlayer(){
  unloadYouTubePlayer();
  if(filmFrame){filmFrame.remove();filmFrame=null}
  filmHost.classList.remove('is-loaded');document.body.classList.remove('film-reading');
  filmStatus.textContent='正在载入 B 站播放器…';
}
function syncFilmPlayer(){
  const active=phase==='reading'&&!chapters.hidden&&!drawStripOpen&&chapterIds[currentChapter]==='film';
  if(!active){if(filmFrame){filmFrame.remove();filmFrame=null}filmHost.classList.remove('is-loaded');document.body.classList.remove('film-reading');return}
  document.body.classList.add('film-reading');if(filmFrame)return;
  const frame=document.createElement('iframe');filmFrame=frame;
  frame.title='《暖暖之家》完整纪录片 · B站播放器';frame.src=filmHost.dataset.embedSrc;
  frame.allow='fullscreen; picture-in-picture; encrypted-media; autoplay';frame.allowFullscreen=true;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.addEventListener('load',()=>{if(filmFrame===frame)filmHost.classList.add('is-loaded')});
  frame.addEventListener('error',()=>{if(filmFrame===frame)filmStatus.textContent='播放器未能载入，可点击下方入口在 B 站观看。'});
  filmHost.append(frame);
}

function markChapter(index){
  currentChapter=Math.max(0,Math.min(chapterIds.length-1,index));
  $('#chapter-number').textContent=String(currentChapter+1);
  document.querySelectorAll('#reading-nav a').forEach((a,i)=>a.classList.toggle('active',i===currentChapter));
  $('#prev-chapter').disabled=currentChapter===0&&!drawStripOpen;
  $('#next-chapter').disabled=drawStripOpen;
  $('#next-chapter').textContent=currentChapter===chapterIds.length-1&&!drawStripOpen?'继续抽取':'下一页';
  $('#next-chapter').setAttribute('aria-label',currentChapter===chapterIds.length-1&&!drawStripOpen?'显示继续抽取区域':'下一页');
  history.replaceState(null,'','#'+chapterIds[currentChapter]);
  syncFilmPlayer();syncVideoProgram();
}
function stripWidth(){return drawStrip?.getBoundingClientRect().width||0}
function readingOffset(){return drawStripOpen?-((chapterIds.length-1)*window.innerWidth+stripWidth()):-currentChapter*window.innerWidth}
function showDrawStrip(animateMove=true){
  drawStripOpen=true;document.body.classList.add('draw-strip-open');
  if(!animateMove){track.style.transition='none';requestAnimationFrame(()=>{track.style.transition=''})}
  track.style.transform=`translate3d(${readingOffset()}px,0,0)`;markChapter(chapterIds.length-1);
  $('#status').textContent='已到达继续抽取区域，可以点击竖条中的银币，返回扭蛋机抽取下一个作品。';
}
function hideDrawStrip(animateMove=true){
  drawStripOpen=false;document.body.classList.remove('draw-strip-open');
  if(!animateMove){track.style.transition='none';requestAnimationFrame(()=>{track.style.transition=''})}
  track.style.transform=`translate3d(${-(chapterIds.length-1)*window.innerWidth}px,0,0)`;markChapter(chapterIds.length-1);
}
function goToChapter(index,animateMove=true){
  if(index>=chapterIds.length){showDrawStrip(animateMove);return}
  if(drawStripOpen){drawStripOpen=false;document.body.classList.remove('draw-strip-open')}
  const target=Math.max(0,Math.min(chapterIds.length-1,index));
  if(!animateMove){track.style.transition='none';requestAnimationFrame(()=>{track.style.transition=''})}
  track.style.transform=`translate3d(${-target*window.innerWidth}px,0,0)`;markChapter(target);
  const heading=document.querySelector('#'+chapterIds[target]+' h1,#'+chapterIds[target]+' h2');
  heading?.setAttribute('tabindex','-1');
}
function setHorizontalReading(index=0,showShell=true){
  unloadFilmPlayer();
  hideModelGallery();
  noteGallery.hidden=true;document.body.classList.remove('note-reading');cameraGallery.hidden=true;chapters.hidden=false;carouselControls.hidden=false;$('#reading-nav').hidden=true;$('#skip').hidden=false;
  document.body.classList.remove('camera-reading','camera-strip-open');document.body.classList.add('reading','horizontal-reading');window.scrollTo({top:0,behavior:'instant'});
  readingShell.hidden=!showShell;readingShell.setAttribute('aria-hidden',String(!showShell));
  chapters.style.opacity='1';readingShell.style.opacity=showShell?'1':'0';goToChapter(index,false);
}
function reveal(target='preparation'){
  generation++;running=false;phase='reading';stopAudio();
  const index=Math.max(0,chapterIds.indexOf(target));setHorizontalReading(index,true);
  $('#status').textContent='影像创作已展开，可依次浏览纪录片、绘本 IP 人物介绍和恐龙短剧，也可通过项目导航跳转。';
}
function collectCapsule(type='tv'){
  collection.hidden=false;
  collection.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.capsule===(type==='tv'?'warm-home':type)));
  const target=collection.querySelector(`[data-capsule="${type==='tv'?'warm-home':type}"]`);if(target)target.hidden=false;
}
function prepareCapsule(type){
  currentCapsule=type;capsule.classList.toggle('camera-capsule',type==='camera');capsule.classList.toggle('note-capsule',type==='note');capsule.classList.toggle('robot-capsule',type==='robot');capsule.classList.remove('opening');
  capsule.querySelectorAll('.tv-half').forEach(img=>{img.src=type==='robot'?'assets/robot-repaired.png':type==='note'?'assets/note-illustration.jpg':type==='camera'?'assets/camera-capsule.png':'assets/tv.png'});
  tvButton.setAttribute('aria-label',type==='robot'?'打开第四个机器人扭蛋，观看场景光影':type==='note'?'打开便利贴扭蛋':type==='camera'?'点击相机镜头，打开相机扭蛋':'转动电视机按钮，打开电视扭蛋');
  $('.capsule-cue').textContent=type==='robot'?'点击打开场景光影':type==='note'?'点击打开便利贴':type==='camera'?'点击相机镜头':'点击电视按钮';
}
async function presentOutlet(g){
  capsule.setAttribute('aria-hidden','true');capsule.style.visibility='hidden';capsule.style.opacity='0';
  outlet.style.visibility='visible';metalHit(ctx?.currentTime||0,145,.1,.18);outlet.setAttribute('aria-hidden','false');
  phase='outlet';outlet.classList.add('awaiting-outlet');outletButton.disabled=false;
  $('#status').textContent=`出口已经出现，可以点击打开；${capsuleName()}扭蛋正在机器内部滚动。`;capsuleTransitSound();
  await animate(outlet,[{opacity:0,transform:'scale(1.08)'},{opacity:1,transform:'scale(1)'}],{duration:700,easing:'ease-out'});if(g!==generation||phase!=='outlet')return;
  outlet.style.opacity='1';outlet.style.transform='scale(1)';
}

async function start(){
  if(running||phase!=='idle'||!chapters.hidden)return;
  soundContext();if(reduced.matches){reveal();return}
  running=true;phase='coin';const g=++generation;
  coin.disabled=true;intro.classList.add('animating');coin.style.animation='none';
  $('#status').textContent='银币正在沿自身边缘侧转并对准投币口。';metalHit(ctx?.currentTime||0,980,.045,.13);
  const dx=intro.clientWidth*.5018-(coin.offsetLeft+coin.offsetWidth/2);
  const dy=intro.clientHeight*.274-(coin.offsetTop+coin.offsetHeight/2);
  const atSlot=`translate3d(${dx}px,${dy}px,0)`;
  await animate(coin,[{transform:'translate3d(0,0,0) scale(1) rotateY(0deg)',opacity:1},{transform:`translate3d(${dx}px,${dy*.57}px,0) scale(.9) rotateY(20deg)`,opacity:1,offset:.55},{transform:`${atSlot} scale(.72) rotateY(64deg)`,opacity:1}],{duration:1250,easing:'cubic-bezier(.4,0,.2,1)'});if(g!==generation)return;
  await animate(coin,[{transform:`${atSlot} scale(.72) rotateY(64deg)`},{transform:`${atSlot} scale(.72) rotateY(82deg)`}],{duration:520,easing:'ease-in-out'});if(g!==generation)return;
  animate($('.slot-depth'),[{opacity:0},{opacity:.85}],{duration:180});await pause(220);if(g!==generation)return;
  $('#status').textContent='带有厚度的银币进入投币口。';
  await animate(coin,[{transform:`${atSlot} scale(.72) rotateY(82deg) translateZ(0)`,opacity:1},{transform:`${atSlot} scale(.69) rotateY(86deg) translateZ(-2px)`,opacity:.9,offset:.58},{transform:`${atSlot} scale(.62) rotateY(89deg) translateZ(-8px)`,opacity:0}],{duration:820,easing:'cubic-bezier(.4,0,.6,1)'});if(g!==generation)return;
  animate($('.slot-depth'),[{opacity:.85},{opacity:0}],{duration:180});
  $('#status').textContent='旋钮围绕自身圆形边缘转动，机器内部齿轮开始运转。';gearSound();
  await animate(knob,[{transform:'rotate(0deg)'},{transform:'rotate(235deg)',offset:.78},{transform:'rotate(205deg)'}],{duration:1350,easing:'cubic-bezier(.45,.05,.28,1)'});if(g!==generation)return;
  prepareCapsule(currentCapsule);await presentOutlet(g);if(g!==generation||phase!=='outlet')return;outletButton.focus({preventScroll:true});
}

async function openOutlet(){
  if(phase!=='outlet')return;
  soundContext();phase='outlet-opening';const g=generation;
  outletButton.disabled=true;outlet.classList.remove('awaiting-outlet');$('#status').textContent='出口正在向外打开。';hingeSound();
  animate($('.cavity'),[{opacity:0},{opacity:1}],{duration:300});
  await animate($('.flap'),[{transform:'perspective(1000px) rotateX(0deg)',opacity:1},{transform:'perspective(1000px) translateY(-5%) rotateX(-76deg)',opacity:.2}],{duration:760,easing:'cubic-bezier(.2,.72,.24,1)'});if(g!==generation)return;
  capsule.style.visibility='visible';capsule.style.opacity='';capsule.setAttribute('aria-hidden','false');phase='capsule';capsule.classList.add('ready');tvButton.disabled=false;collectCapsule(currentCapsule);
  $('#status').textContent=currentCapsule==='robot'?'第四个机器人扭蛋正在从出口落下。':`${capsuleName()}扭蛋已经出现，可以立即点击打开。`;
  await animate(capsule,[{opacity:0,transform:'translate(0,-10%) scale(.24) rotate(-82deg)'},{opacity:1,transform:'translate(0,0) scale(.45) rotate(-48deg)',offset:.2},{opacity:1,transform:'translate(0,34%) scale(.84) rotate(16deg)',offset:.68},{opacity:1,transform:'translate(0,22%) scale(1.02) rotate(-5deg)',offset:.88},{opacity:1,transform:'translate(0,25%) scale(1) rotate(0deg)'}],{duration:1700,easing:'cubic-bezier(.22,.65,.28,1)'});if(g!==generation||phase!=='capsule')return;
  metalHit(ctx?.currentTime||0,105,.14,.25);await pause(430);if(g!==generation)return;
  tvButton.focus({preventScroll:true});
  $('#status').textContent=currentCapsule==='robot'?'机器人扭蛋已经停下，点击打开场景模型光影。':currentCapsule==='note'?'便利贴扭蛋已经停下，可以点击打开。':currentCapsule==='camera'?'相机扭蛋已经停下，请点击中央镜头。':'电视机扭蛋已经停下，请点击电视机右侧的圆形按钮。';
}

function settleCapsuleForOpening(){
  capsule.getAnimations().forEach(animation=>animation.cancel());
  capsule.style.opacity='1';capsule.style.transform='translate(0,25%) scale(1) rotate(0deg)';
}

async function openCapsule(){
  if(phase!=='capsule')return;
  settleCapsuleForOpening();
  if(currentCapsule==='robot'){await openRobotCapsule();return}
  if(currentCapsule==='note'){await openNoteCapsule();return}
  if(currentCapsule==='camera'){await openCameraCapsule();return}
  soundContext();phase='capsule-opening';const g=generation;
  tvButton.disabled=true;capsule.classList.remove('ready');$('#status').textContent='电视机扭蛋沿屏幕边界打开，纪录片内容同步显现。';capsuleOpenSound();
  chapters.hidden=false;chapters.style.opacity='0';readingShell.hidden=false;readingShell.setAttribute('aria-hidden','false');readingShell.style.opacity='0';
  $('#reading-nav').hidden=true;$('#skip').hidden=false;goToChapter(0,false);
  document.body.classList.add('reading','horizontal-reading','capsule-transitioning');window.scrollTo({top:0,behavior:'instant'});
  $('.transition-light').style.opacity='1';home.style.opacity='0';
  await Promise.all([
    animate(outlet,[{opacity:1},{opacity:0}],{duration:120,easing:'ease-out'}),
    animate($('.transition-light'),[{opacity:1,offset:0},{opacity:1,offset:.18},{opacity:0,offset:1}],{duration:1050,easing:'ease-in-out'}),
    animate($('.tv-top'),[{transform:'translateY(0) rotate(0deg)',opacity:1},{transform:'translateY(-65%) rotate(-4deg)',opacity:0}],{duration:920,easing:'cubic-bezier(.24,.7,.25,1)'}),
    animate($('.tv-bottom'),[{transform:'translateY(0) rotate(0deg)',opacity:1},{transform:'translateY(65%) rotate(4deg)',opacity:0}],{duration:920,easing:'cubic-bezier(.24,.7,.25,1)'}),
    animate(capsule,[{opacity:1,offset:0},{opacity:1,offset:.38},{opacity:0,offset:.82},{opacity:0,offset:1}],{duration:1050,easing:'ease-out'}),
    animate(chapters,[{opacity:0},{opacity:1}],{duration:900,delay:150,easing:'ease-out'}),
    animate(readingShell,[{opacity:0},{opacity:1}],{duration:760,delay:220,easing:'ease-out'}),
    animate($('.shell-top'),[{transform:'translate(-50%,28vh)'},{transform:'translate(-50%,0)'}],{duration:1050,easing:'cubic-bezier(.2,.72,.22,1)'}),
    animate($('.shell-bottom'),[{transform:'translate(-50%,-28vh)'},{transform:'translate(-50%,0)'}],{duration:1050,easing:'cubic-bezier(.2,.72,.22,1)'})
  ]);if(g!==generation)return;
  document.body.classList.remove('capsule-transitioning');carouselControls.hidden=false;$('#skip').hidden=false;phase='reading';running=false;
  $('#status').textContent='可在扭蛋上下部分之间左右拖拽，或点击上一页、下一页浏览纪录片过程。';
}

function setCard(index){
  const cards=[...document.querySelectorAll('.photo-card')];currentCard=Math.max(0,Math.min(cards.length-1,index));
  cards.forEach((card,i)=>{card.classList.remove('active','next','prev','far');const delta=i-currentCard;if(delta===0)card.classList.add('active');else if(delta===1)card.classList.add('next');else if(delta===-1)card.classList.add('prev');else card.classList.add('far')});
  document.querySelectorAll('#card-dots i').forEach((dot,i)=>dot.classList.toggle('active',i===currentCard));
  $('#card-prev').disabled=currentCard===0;
  $('#card-next').setAttribute('aria-label',currentCard===cards.length-1?'显示继续抽取区域':'下一张图片');
}
function advanceCameraCard(){
  const cards=document.querySelectorAll('.photo-card');
  if(currentCard>=cards.length-1){showCameraDrawStrip();return}
  setCard(currentCard+1);
}
function showCameraGallery(index=0){
  unloadFilmPlayer();
  hideModelGallery();
  noteGallery.hidden=true;document.body.classList.remove('note-reading');
  generation++;running=false;phase='camera-reading';stopAudio();drawStripOpen=false;cameraStripOpen=false;
  chapters.hidden=true;carouselControls.hidden=true;readingShell.hidden=true;readingShell.setAttribute('aria-hidden','true');cameraGallery.hidden=false;cameraGallery.style.opacity='1';cameraGalleryTrack.style.transform='translate3d(0,0,0)';
  document.body.classList.remove('horizontal-reading','capsule-transitioning','draw-strip-open','camera-strip-open');document.body.classList.add('reading','camera-reading');setCard(index);collectCapsule('camera');
  $('#skip').hidden=false;window.scrollTo({top:0,behavior:'instant'});$('#status').textContent='相机扭蛋卡片已展开，可以逐张点击或使用左右按钮翻阅。';
}
async function openCameraCapsule(){
  soundContext();phase='capsule-opening';const g=generation;tvButton.disabled=true;capsule.classList.remove('ready');capsule.classList.add('opening');capsuleOpenSound();
  cameraGallery.hidden=false;cameraGallery.style.opacity='0';cameraGalleryTrack.style.transform='translate3d(0,0,0)';chapters.hidden=true;carouselControls.hidden=true;readingShell.hidden=true;
  document.body.classList.remove('horizontal-reading','draw-strip-open');document.body.classList.add('reading','camera-reading','capsule-transitioning');$('.transition-light').style.opacity='1';home.style.opacity='0';
  await Promise.all([
    animate(outlet,[{opacity:1},{opacity:0}],{duration:180,easing:'ease-out'}),
    animate($('.transition-light'),[{opacity:1,offset:0},{opacity:1,offset:.2},{opacity:0,offset:1}],{duration:900,easing:'ease-in-out'}),
    animate($('.tv-top'),[{transform:'translateY(0) rotate(0deg)',opacity:1},{transform:'translateY(-70%) rotate(-3deg)',opacity:0}],{duration:820,easing:'cubic-bezier(.24,.7,.25,1)'}),
    animate($('.tv-bottom'),[{transform:'translateY(0) rotate(0deg)',opacity:1},{transform:'translateY(70%) rotate(3deg)',opacity:0}],{duration:820,easing:'cubic-bezier(.24,.7,.25,1)'}),
    animate(capsule,[{opacity:1,offset:0},{opacity:1,offset:.35},{opacity:0,offset:1}],{duration:900,easing:'ease-out'}),
    animate(cameraGallery,[{opacity:0},{opacity:1}],{duration:760,delay:150,easing:'ease-out'})
  ]);if(g!==generation)return;
  document.body.classList.remove('capsule-transitioning');cameraGallery.style.opacity='1';phase='camera-reading';running=false;setCard(0);collectCapsule('camera');$('#skip').hidden=false;
  $('#status').textContent=`相机扭蛋已打开，共有${document.querySelectorAll('.photo-card').length}张独立图片卡片。`;
}
function showCameraDrawStrip(animateMove=true){
  cameraStripOpen=true;document.body.classList.add('camera-strip-open');
  if(!animateMove){cameraGalleryTrack.style.transition='none';requestAnimationFrame(()=>{cameraGalleryTrack.style.transition=''})}
  cameraGalleryTrack.style.transform=`translate3d(${-cameraDrawStrip.getBoundingClientRect().width}px,0,0)`;$('#status').textContent='已进入右侧投币区域。';
}
function hideCameraDrawStrip(animateMove=true){
  cameraStripOpen=false;document.body.classList.remove('camera-strip-open');
  if(!animateMove){cameraGalleryTrack.style.transition='none';requestAnimationFrame(()=>{cameraGalleryTrack.style.transition=''})}
  cameraGalleryTrack.style.transform='translate3d(0,0,0)';
}
async function animateStripMechanism(button,slot,knobNode,panel){
  soundContext();stripRunning=true;panel.classList.add('busy');button.disabled=true;
  const coinRect=button.getBoundingClientRect(),slotRect=slot.getBoundingClientRect(),dx=slotRect.left+slotRect.width/2-(coinRect.left+coinRect.width/2),dy=slotRect.top+slotRect.height/2-(coinRect.top+coinRect.height/2),atSlot=`translate3d(${dx}px,${dy}px,0)`;
  $('#status').textContent='银币正在侧转并进入投币口。';metalHit(ctx?.currentTime||0,980,.045,.13);
  await animate(button,[{transform:'translate3d(0,0,0) scale(1) rotateY(0deg)',opacity:1},{transform:`translate3d(${dx*.55}px,${dy*.55}px,0) scale(.9) rotateY(24deg)`,opacity:1,offset:.5},{transform:`${atSlot} scale(.72) rotateY(82deg)`,opacity:1}],{duration:1100,easing:'cubic-bezier(.4,0,.2,1)'});
  await animate(button,[{transform:`${atSlot} scale(.72) rotateY(82deg)`,opacity:1},{transform:`${atSlot} scale(.64) rotateY(89deg) translateZ(-8px)`,opacity:0}],{duration:700,easing:'cubic-bezier(.4,0,.6,1)'});
  $('#status').textContent='旋钮转动，机器开始抽取下一枚扭蛋。';gearSound();await animate(knobNode,[{transform:'rotate(0deg)'},{transform:'rotate(235deg)',offset:.78},{transform:'rotate(205deg)'}],{duration:1350,easing:'cubic-bezier(.45,.05,.28,1)'});await pause(200);
}
async function beginNextCapsule(type){
  unloadFilmPlayer();
  hideModelGallery();
  generation++;const g=generation;playing.forEach(a=>a.cancel());playing=[];stopAudio();running=true;phase='coin';currentCapsule=type;prepareCapsule(type);
  document.body.classList.remove('reading','horizontal-reading','camera-reading','capsule-transitioning','dragging','draw-strip-open','camera-strip-open','note-strip-open');chapters.hidden=true;noteGallery.hidden=true;document.body.classList.remove('note-reading');cameraGallery.hidden=true;carouselControls.hidden=true;readingShell.hidden=true;readingShell.setAttribute('aria-hidden','true');
  drawStripOpen=false;cameraStripOpen=false;noteStripOpen=false;noteDrawStrip.inert=true;noteDrawStrip.setAttribute('aria-hidden','true');track.style.transform='';cameraGalleryTrack.style.transform='';intro.classList.add('animating');home.style.opacity='0';$('.transition-light').style.opacity='0';
  outlet.classList.remove('awaiting-outlet');outlet.setAttribute('aria-hidden','true');outlet.style.visibility='hidden';outlet.style.opacity='';outlet.style.transform='';outletButton.disabled=true;
  $('.flap').style.transform='';$('.flap').style.opacity='';$('.cavity').style.opacity='';
  capsule.classList.remove('ready');capsule.setAttribute('aria-hidden','true');capsule.style.visibility='hidden';capsule.style.opacity='0';tvButton.disabled=true;
  await presentOutlet(g);if(g===generation&&phase==='outlet')outletButton.focus({preventScroll:true});
}
async function useStripCoin(){
  if(stripRunning||phase!=='reading')return;await animateStripMechanism(stripCoin,stripSlot,stripKnob,drawStrip);stripRunning=false;drawStrip.classList.remove('busy');stripCoin.disabled=false;await beginNextCapsule('camera');
}
async function useCameraStripCoin(){
  if(stripRunning||phase!=='camera-reading')return;await animateStripMechanism(cameraStripCoin,cameraStripSlot,cameraStripKnob,cameraDrawStrip);stripRunning=false;cameraDrawStrip.classList.remove('busy');cameraStripCoin.disabled=false;await beginNextCapsule('note');
}
function showNoteDrawStrip(){
  noteStripOpen=true;noteDrawStrip.inert=false;noteDrawStrip.setAttribute('aria-hidden','false');document.body.classList.add('note-strip-open');$('#museum-next').setAttribute('aria-label','继续抽取区域已打开');
  $('#status').textContent='第三个扭蛋的作品已浏览完，可以投入银币抽取第四个机器人扭蛋。';
  noteStripCoin.focus({preventScroll:true});
}
function hideNoteDrawStrip(){
  noteStripOpen=false;noteDrawStrip.inert=true;noteDrawStrip.setAttribute('aria-hidden','true');document.body.classList.remove('note-strip-open');$('#museum-next').setAttribute('aria-label','显示继续抽取区域');
}
async function useNoteStripCoin(){
  if(stripRunning||phase!=='note-reading')return;await animateStripMechanism(noteStripCoin,noteStripSlot,noteStripKnob,noteDrawStrip);stripRunning=false;noteDrawStrip.classList.remove('busy');noteStripCoin.disabled=false;await beginNextCapsule('robot');
}

function reset(){
  unloadFilmPlayer();
  hideModelGallery();
  generation++;running=false;phase='idle';stopAudio();playing.forEach(a=>a.cancel());playing=[];
  document.body.classList.remove('reading','horizontal-reading','camera-reading','capsule-transitioning','dragging','draw-strip-open','camera-strip-open','note-strip-open');document.documentElement.classList.remove('peek-scroll');
  chapters.hidden=true;chapters.style.opacity='';noteGallery.hidden=true;document.body.classList.remove('note-reading');cameraGallery.hidden=true;cameraGallery.style.opacity='';carouselControls.hidden=true;readingShell.hidden=true;readingShell.style.opacity='';readingShell.setAttribute('aria-hidden','true');track.style.transform='';track.style.transition='';cameraGalleryTrack.style.transform='';cameraGalleryTrack.style.transition='';
  $('#reading-nav').hidden=true;$('#skip').hidden=false;intro.classList.remove('animating');
  outlet.classList.remove('awaiting-outlet');outlet.setAttribute('aria-hidden','true');outlet.style.visibility='';outlet.style.opacity='';outlet.style.transform='';outletButton.disabled=true;
  $('.flap').style.transform='';$('.flap').style.opacity='';$('.cavity').style.opacity='';
  capsule.classList.remove('ready');capsule.setAttribute('aria-hidden','true');capsule.style.visibility='';capsule.style.opacity='';tvButton.disabled=true;
  currentChapter=0;currentCard=0;currentCapsule='tv';prepareCapsule('tv');drawStripOpen=false;cameraStripOpen=false;noteStripOpen=false;noteDrawStrip.inert=true;noteDrawStrip.setAttribute('aria-hidden','true');stripRunning=false;drawStrip.classList.remove('busy');cameraDrawStrip.classList.remove('busy');noteDrawStrip.classList.remove('busy');stripCoin.disabled=false;cameraStripCoin.disabled=false;noteStripCoin.disabled=false;home.style.opacity='';$('.transition-light').style.opacity='0';coin.disabled=false;coin.style.animation='';history.replaceState(null,'',location.pathname+location.search);window.scrollTo({top:0,behavior:'instant'});coin.focus({preventScroll:true});
  $('#status').textContent='已返回首页，可以再次投入银币。';
}

async function skipCurrentStep(){
  if(phase==='idle'||phase==='coin'){
    generation++;playing.forEach(a=>a.cancel());playing=[];const g=generation;running=true;phase='coin';soundContext();coin.disabled=true;coin.style.animation='none';intro.classList.add('animating');prepareCapsule(currentCapsule);$('#status').textContent='已跳过投币动画，进入出口交互。';await presentOutlet(g);return;
  }
  if(phase==='outlet'){await openOutlet();return}
  if(phase==='capsule'){await openCapsule();return}
  if(phase==='model-reading'||phase==='exhibition-reading'){reset();return}
  if(phase==='note-reading'){if(noteStripOpen)await useNoteStripCoin();else showNoteDrawStrip();return}
  if(phase==='reading'){if(drawStripOpen)await useStripCoin();else showDrawStrip();return}
  if(phase==='camera-reading'){if(cameraStripOpen)await useCameraStripCoin();else showCameraDrawStrip();return}
}

coin.addEventListener('click',start);outletButton.addEventListener('click',openOutlet);tvButton.addEventListener('click',openCapsule);
stripCoin.addEventListener('click',useStripCoin);
cameraStripCoin.addEventListener('click',useCameraStripCoin);
noteStripCoin.addEventListener('click',useNoteStripCoin);
collection.querySelector('[data-capsule="warm-home"]')?.addEventListener('click',()=>{if(phase==='reading')goToChapter(0,false);else reveal('preparation');collectCapsule('tv')});
collection.querySelector('[data-capsule="camera"]')?.addEventListener('click',()=>showCameraGallery(0));
collection.querySelector('[data-capsule="note"]')?.addEventListener('click',showNoteGallery);
collection.querySelector('[data-capsule="robot"]')?.addEventListener('click',showModelGallery);
$('#skip').addEventListener('click',skipCurrentStep);$('.restart')?.addEventListener('click',reset);
$('#card-prev').addEventListener('click',()=>setCard(currentCard-1));$('#card-next').addEventListener('click',advanceCameraCard);
document.querySelectorAll('.photo-card').forEach(card=>card.addEventListener('click',()=>{const index=Number(card.dataset.card);if(index===currentCard)advanceCameraCard();else setCard(index)}));
$('#sound').addEventListener('click',()=>{muted=!muted;$('#sound').textContent=muted?'声音 关':'声音 开';$('#sound').setAttribute('aria-pressed',String(muted));if(muted)stopAudio()});
$('#prev-chapter').addEventListener('click',()=>drawStripOpen?hideDrawStrip():goToChapter(currentChapter-1));$('#next-chapter').addEventListener('click',()=>goToChapter(currentChapter+1));
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const index=chapterIds.indexOf(a.hash.slice(1));if(index>=0&&phase==='reading'){e.preventDefault();goToChapter(index)}}));
chapters.addEventListener('pointerdown',e=>{if(phase!=='reading'||e.target.closest('a,button,iframe,.film-screen,.video-screen,.video-selection'))return;dragStartX=e.clientX;dragDelta=0;dragPointer=e.pointerId;chapters.setPointerCapture?.(e.pointerId);document.body.classList.add('dragging')});
chapters.addEventListener('pointermove',e=>{if(dragStartX===null||e.pointerId!==dragPointer)return;dragDelta=e.clientX-dragStartX;track.style.transform=`translate3d(${readingOffset()+dragDelta}px,0,0)`});
function finishDrag(e){if(dragStartX===null||e.pointerId!==dragPointer)return;const threshold=Math.min(140,window.innerWidth*.12);document.body.classList.remove('dragging');if(drawStripOpen){if(dragDelta>threshold)hideDrawStrip();else showDrawStrip()}else if(dragDelta<-threshold)goToChapter(currentChapter+1);else if(dragDelta>threshold)goToChapter(currentChapter-1);else goToChapter(currentChapter);dragStartX=null;dragDelta=0;dragPointer=null}
chapters.addEventListener('pointerup',finishDrag);chapters.addEventListener('pointercancel',finishDrag);
window.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')document.body.classList.add('cursor-pressed')});['pointerup','pointercancel','blur'].forEach(event=>window.addEventListener(event,()=>document.body.classList.remove('cursor-pressed')));
window.addEventListener('resize',()=>{if(phase==='reading'){if(drawStripOpen)showDrawStrip(false);else goToChapter(currentChapter,false)}if(phase==='camera-reading'&&cameraStripOpen)showCameraDrawStrip(false)});
window.addEventListener('keydown',e=>{if(e.target.closest('button,a,iframe,input,textarea,select'))return;if(phase==='reading'&&e.key==='ArrowLeft'){if(drawStripOpen)hideDrawStrip();else goToChapter(currentChapter-1)}if(phase==='reading'&&e.key==='ArrowRight')goToChapter(currentChapter+1);if(phase==='camera-reading'&&e.key==='ArrowLeft'){if(cameraStripOpen)hideCameraDrawStrip();else setCard(currentCard-1)}if(phase==='camera-reading'&&e.key==='ArrowRight'){if(cameraStripOpen)return;advanceCameraCard()}if(e.key==='Escape'&&running){playing.forEach(a=>a.cancel());reveal()}});
window.addEventListener('hashchange',()=>{const index=chapterIds.indexOf(location.hash.slice(1));if(index>=0){if(phase==='reading')goToChapter(index);else reveal(chapterIds[index])}});
prepareCapsule('tv');collection.hidden=true;collection.querySelectorAll('button').forEach(button=>{button.hidden=true;button.classList.remove('active')});

function showNoteGallery(){
  unloadFilmPlayer();
  hideModelGallery();
  generation++;playing.forEach(a=>a.cancel());playing=[];stopAudio();running=false;phase='note-reading';setMuseumArtwork(0);
  chapters.hidden=true;cameraGallery.hidden=true;readingShell.hidden=true;readingShell.setAttribute('aria-hidden','true');carouselControls.hidden=true;
  noteStripOpen=false;noteDrawStrip.inert=true;noteDrawStrip.setAttribute('aria-hidden','true');document.body.classList.remove('horizontal-reading','camera-reading','draw-strip-open','camera-strip-open','note-strip-open','capsule-transitioning');
  document.body.classList.add('reading','note-reading');noteGallery.hidden=false;noteGallery.style.opacity='1';
  $('#skip').hidden=false;collectCapsule('note');window.scrollTo({top:0,behavior:'instant'});
  $('#status').textContent='手绘小展已打开，共八件作品，可使用左右按钮或方向键浏览。';
}
async function openNoteCapsule(){
  phase='capsule-opening';const g=generation;tvButton.disabled=true;capsule.classList.remove('ready');capsule.classList.add('opening');soundContext();capsuleOpenSound();
  noteGallery.hidden=false;noteGallery.style.opacity='0';document.body.classList.add('capsule-transitioning');
  await Promise.all([
    animate(capsule,[{opacity:1,transform:'translate(0,25%) scale(1)'},{opacity:0,transform:'translate(0,25%) scale(1.12)'}],{duration:650,easing:'ease-out'}),
    animate(noteGallery,[{opacity:0},{opacity:1}],{duration:700,easing:'ease-out'})
  ]);if(g!==generation)return;showNoteGallery();
}

const museumWorks=[
  {src:'assets/note-illustration.jpg',title:'便利贴',cutout:false},
  {src:'assets/hand-drawn-02.jpg',mask:'assets/hand-drawn-02-mask.png',title:'棋盘',cutout:true},
  {src:'assets/hand-drawn-03.jpg',mask:'assets/hand-drawn-03-mask.png',title:'躺着',cutout:true},
  {src:'assets/hand-drawn-04.jpg',mask:'assets/hand-drawn-04-mask.png',title:'头像 sample3',cutout:true},
  {src:'assets/hand-drawn-05.jpg',mask:'assets/hand-drawn-05-mask.png',title:'阳光小狗',cutout:true},
  {src:'assets/hand-drawn-06.jpg',mask:'assets/hand-drawn-06-mask.png',title:'男鬼',cutout:true},
  {src:'assets/hand-drawn-07.jpg',title:'day6',cutout:false},
  {src:'assets/hand-drawn-08.jpg',title:'双人',cutout:false}
];
let currentMuseumWork=0,museumTouchX=null,museumRequest=0;
const museumContours={"2":{"width":1000,"height":1000,"bounds":[4,15,995,975],"path":"M401.47058823529414 15.470588235294118C412.65,14.85,447.05,14.44,459.24,15.76C471.42,17.09,479.68,22.82,498.94,26.06C518.20,29.30,589.06,36.94,613.29,41.71C637.53,46.47,672.07,54.83,692.82,64.18C713.57,73.52,765.86,110.96,779.29,116.47C792.73,121.99,795.08,109.60,800.29,108.29C805.51,106.99,816.51,105.93,821.00,106.00C825.49,106.07,832.24,107.26,836.18,108.82C840.12,110.38,848.82,115.31,852.53,118.47C856.24,121.63,863.13,129.62,865.88,134.12C868.63,138.62,873.05,149.32,874.53,154.47C876.01,159.62,877.64,168.46,877.71,175.29C877.77,182.13,873.04,201.70,875.06,209.18C877.08,216.65,888.46,229.20,893.88,235.12C899.31,241.04,913.57,250.68,918.47,256.53C923.37,262.38,930.48,274.52,933.06,281.94C935.64,289.36,932.58,294.54,939.12,315.88C945.65,337.22,977.99,428.13,985.35,452.65C992.71,477.16,997.98,492.76,998.00,512.00C998.02,531.24,988.21,591.71,985.53,606.53C982.85,621.35,981.51,621.01,976.59,630.59C971.66,640.16,951.86,666.24,946.12,683.12C940.38,700.00,934.57,752.07,930.65,765.65C926.73,779.23,918.64,787.01,914.76,791.76C910.89,796.51,905.62,800.46,899.65,803.65C893.68,806.83,873.99,812.22,867.00,817.24C860.01,822.25,853.12,834.90,843.76,843.76C834.40,852.62,802.22,879.85,792.12,888.12C782.01,896.39,772.76,903.76,762.94,909.94C753.12,916.12,732.52,929.40,713.59,937.59C694.65,945.78,633.92,969.21,611.47,975.47C589.02,981.73,550.42,985.85,534.00,987.65C517.58,989.45,491.36,989.93,480.12,989.88C468.88,989.83,464.10,991.69,444.06,987.24C424.01,982.78,343.71,962.63,319.76,954.24C295.82,945.84,271.69,923.90,252.53,920.06C233.37,916.22,182.70,924.25,166.47,923.53C150.24,922.81,131.33,917.17,122.71,914.29C114.08,911.42,102.87,905.01,97.47,900.53C92.07,896.05,83.05,885.32,79.53,878.47C76.01,871.62,70.86,853.76,69.29,845.71C67.73,837.65,66.22,824.77,67.00,814.00C67.78,803.23,74.46,769.48,75.53,759.53C76.60,749.58,77.51,741.62,75.59,734.41C73.66,727.21,65.51,715.99,60.12,701.88C54.73,687.77,38.26,635.62,32.47,621.53C26.68,607.44,17.10,597.15,13.82,589.18C10.55,581.20,7.52,570.73,6.29,557.71C5.07,544.68,3.66,498.96,4.00,485.00C4.34,471.04,7.12,455.24,9.00,446.00C10.88,436.76,15.10,420.47,19.06,411.06C23.02,401.65,36.91,379.12,40.71,370.71C44.50,362.29,51.05,349.68,49.41,343.76C47.77,337.85,31.77,329.38,27.59,323.41C23.40,317.45,17.15,304.74,15.94,296.06C14.74,287.38,16.10,262.61,17.94,253.94C19.79,245.27,27.08,232.33,30.71,226.71C34.33,221.08,41.87,212.24,46.94,208.94C52.01,205.64,65.35,200.97,71.29,200.29C77.24,199.62,88.89,200.94,94.47,203.53C100.05,206.12,108.85,224.04,115.94,221.00C123.04,217.96,138.72,191.60,151.24,179.24C163.75,166.87,204.24,133.87,216.06,122.06C227.88,110.25,239.57,91.69,245.76,84.76C251.96,77.84,259.88,71.25,265.65,66.65C271.42,62.04,285.65,51.65,291.94,47.94C298.24,44.24,306.27,40.40,316.00,37.00C325.73,33.60,359.08,23.46,369.76,20.76C380.45,18.07,390.29,16.10,401.47,15.47ZM71.05882352941177 246.8235294117647C69.18,247.85,61.91,256.01,60.12,259.12C58.32,262.23,57.07,267.62,56.71,271.71C56.35,275.79,56.14,288.19,57.24,291.76C58.33,295.34,62.61,302.55,65.47,300.29C68.33,298.04,78.91,279.88,80.12,273.71C81.32,267.53,76.25,254.24,75.12,250.88C73.99,247.52,72.93,245.79,71.06,246.82ZM115.11764705882354 796.8235294117648C106.88,790.14,111.77,802.81,111.29,810.29C110.82,817.78,110.11,848.46,111.29,856.71C112.48,864.95,117.53,872.35,120.76,876.24C124.00,880.12,132.99,885.64,137.18,887.82C141.37,890.01,144.01,892.12,154.29,893.71C164.57,895.29,216.54,904.21,219.41,900.47C222.28,896.73,190.27,876.72,177.24,863.76C164.20,850.81,123.36,803.51,115.12,796.82Z"},"3":{"width":2000,"height":2000,"bounds":[14,16,1972,1972],"path":"M972.4705882352941 16.470588235294116C994.28,15.53,1024.25,15.99,1044.00,17.00C1063.75,18.01,1111.23,22.15,1130.47,24.53C1149.71,26.91,1179.61,32.21,1197.94,36.06C1216.27,39.90,1264.68,54.75,1277.12,55.29C1289.55,55.84,1292.30,42.32,1297.41,40.41C1302.52,38.50,1313.43,38.42,1318.00,40.00C1322.57,41.58,1331.03,48.60,1333.94,53.06C1336.85,57.52,1338.77,72.13,1341.29,75.71C1343.82,79.28,1349.08,82.40,1354.12,81.65C1359.15,80.90,1374.32,70.58,1381.59,69.71C1388.86,68.83,1406.49,76.58,1412.29,74.65C1418.10,72.71,1423.35,55.22,1428.06,54.24C1432.77,53.25,1445.57,65.85,1450.00,66.76C1454.43,67.68,1459.60,61.96,1463.53,61.53C1467.46,61.10,1477.27,64.14,1481.41,63.35C1485.55,62.57,1493.14,56.21,1496.65,55.24C1500.15,54.26,1505.77,54.12,1509.47,55.53C1513.17,56.93,1522.94,65.41,1526.24,66.47C1529.53,67.53,1531.78,64.01,1535.82,64.00C1539.87,63.99,1552.71,64.65,1558.59,66.41C1564.47,68.18,1578.20,74.89,1582.88,78.12C1587.57,81.35,1591.85,89.45,1596.06,92.24C1600.27,95.02,1613.40,97.01,1616.59,100.41C1619.78,103.81,1618.66,115.59,1621.59,119.41C1624.51,123.24,1636.88,127.42,1640.00,131.00C1643.12,134.58,1641.58,144.82,1646.59,148.06C1651.60,151.30,1673.38,154.21,1680.06,156.94C1686.74,159.68,1695.58,165.79,1700.06,169.94C1704.54,174.09,1713.21,184.79,1715.88,190.12C1718.55,195.45,1720.88,206.07,1721.41,212.59C1721.95,219.11,1722.55,233.49,1720.18,242.29C1717.80,251.10,1704.09,277.07,1702.41,283.06C1700.74,289.05,1696.75,284.93,1706.76,290.24C1716.78,295.54,1772.15,321.05,1782.53,325.47C1792.91,329.89,1788.10,325.88,1789.82,325.59C1791.55,325.30,1795.93,328.10,1796.35,323.18C1796.77,318.25,1792.80,293.15,1793.18,286.18C1793.55,279.20,1796.48,270.98,1799.35,267.35C1802.23,263.73,1812.07,258.99,1816.18,257.18C1820.29,255.36,1827.71,253.02,1832.24,252.82C1836.76,252.62,1848.50,254.26,1852.41,255.59C1856.32,256.92,1861.40,259.43,1863.53,263.47C1865.65,267.51,1867.48,284.00,1869.41,287.94C1871.35,291.88,1874.64,290.15,1879.00,295.00C1883.36,299.85,1900.49,321.01,1904.29,326.71C1908.10,332.40,1908.98,336.82,1909.41,340.59C1909.85,344.35,1907.26,352.37,1907.76,356.82C1908.27,361.28,1910.18,372.47,1913.47,376.24C1916.76,380.00,1930.85,384.76,1934.06,386.94C1937.26,389.12,1939.50,389.14,1939.12,393.65C1938.74,398.15,1934.96,412.31,1931.00,423.00C1927.04,433.69,1907.55,472.16,1907.47,479.18C1907.39,486.19,1926.74,478.69,1930.35,479.12C1933.97,479.54,1935.07,480.06,1936.41,482.59C1937.75,485.12,1940.65,495.08,1941.06,499.35C1941.47,503.62,1937.38,512.01,1939.71,516.76C1942.03,521.51,1955.67,532.34,1959.65,537.35C1963.62,542.37,1970.26,553.58,1971.53,556.88C1972.79,560.18,1971.46,561.76,1969.76,563.76C1968.07,565.77,1963.46,570.52,1957.94,572.94C1952.42,575.36,1927.74,574.08,1925.59,583.12C1923.44,592.15,1939.04,634.74,1940.76,645.24C1942.49,655.73,1937.12,661.60,1939.41,667.06C1941.71,672.51,1955.46,683.04,1959.12,688.88C1962.77,694.72,1968.17,709.40,1968.65,713.76C1969.12,718.12,1963.63,721.10,1962.94,723.76C1962.25,726.43,1964.34,732.16,1963.12,735.12C1961.90,738.07,1951.96,734.29,1953.18,747.41C1954.40,760.54,1969.24,819.08,1972.88,840.12C1976.52,861.15,1980.65,892.35,1982.29,915.71C1983.93,939.07,1986.12,1004.04,1986.00,1027.00C1985.88,1049.96,1983.49,1079.49,1981.35,1099.35C1979.22,1119.22,1973.07,1164.19,1968.94,1185.94C1964.82,1207.69,1954.23,1252.60,1948.35,1273.35C1942.48,1294.10,1929.19,1332.82,1921.94,1351.94C1914.69,1371.07,1900.38,1405.88,1890.35,1426.35C1880.32,1446.82,1855.22,1493.72,1841.71,1515.71C1828.19,1537.69,1797.10,1582.60,1782.24,1602.24C1767.37,1621.87,1739.64,1654.76,1722.76,1672.76C1705.89,1690.76,1665.93,1729.80,1647.24,1746.24C1628.54,1762.67,1592.04,1790.79,1573.24,1804.24C1554.43,1817.68,1517.16,1841.91,1496.76,1853.76C1476.37,1865.62,1432.82,1888.70,1410.06,1899.06C1387.29,1909.42,1338.76,1928.51,1314.65,1936.65C1290.53,1944.78,1243.02,1958.40,1217.12,1964.12C1191.21,1969.84,1131.18,1979.43,1107.41,1982.41C1083.65,1985.40,1053.85,1988.00,1027.00,1988.00C1000.15,1988.00,923.60,1985.52,892.59,1982.41C861.57,1979.30,805.91,1969.21,778.88,1963.12C751.85,1957.02,701.51,1942.37,676.35,1933.65C651.20,1924.93,600.39,1903.99,577.65,1893.35C554.90,1882.72,515.65,1861.47,494.41,1848.59C473.17,1835.71,429.00,1806.38,407.71,1790.29C386.41,1774.21,343.57,1738.18,324.06,1719.94C304.55,1701.70,269.39,1665.24,251.65,1644.35C233.90,1623.47,198.49,1577.38,182.12,1552.88C165.74,1528.38,132.78,1471.22,120.65,1448.35C108.51,1425.49,93.57,1391.43,85.06,1369.94C76.54,1348.46,59.65,1301.48,52.53,1276.47C45.41,1251.46,32.58,1194.79,28.12,1169.88C23.65,1144.97,18.59,1101.29,16.82,1077.18C15.06,1053.07,13.07,1004.49,14.00,977.00C14.93,949.51,20.22,885.72,24.29,857.29C28.37,828.87,39.72,775.60,46.59,749.59C53.46,723.58,70.60,672.23,79.24,649.24C87.87,626.24,103.78,588.90,115.65,565.65C127.51,542.39,158.69,487.07,174.18,463.18C189.66,439.29,220.52,397.15,239.53,374.53C258.54,351.91,306.32,301.45,326.24,282.24C346.15,263.02,379.19,235.82,398.82,220.82C418.46,205.83,459.82,176.57,483.29,162.29C506.77,148.02,560.92,118.67,586.65,106.65C612.38,94.62,665.98,74.10,689.12,66.12C712.26,58.13,749.21,47.96,771.76,42.76C794.32,37.57,844.44,27.82,869.53,24.53C894.62,21.24,950.66,17.41,972.47,16.47Z"},"4":{"width":1500,"height":1500,"bounds":[20,60,1447,1386],"path":"M1003.8823529411765 60.8235294117647C1008.69,59.56,1018.96,59.35,1023.29,61.71C1027.63,64.06,1034.69,77.42,1038.59,79.65C1042.49,81.88,1051.24,79.04,1054.47,79.53C1057.71,80.01,1061.72,80.40,1064.47,83.53C1067.22,86.65,1075.22,99.37,1076.47,104.53C1077.72,109.69,1072.14,122.53,1074.47,124.82C1076.80,127.12,1091.24,121.92,1095.12,122.88C1098.99,123.85,1102.90,126.18,1105.47,132.53C1108.04,138.88,1115.04,167.18,1115.71,173.71C1116.37,180.24,1113.76,180.61,1110.76,184.76C1107.77,188.92,1094.13,201.81,1091.76,206.94C1089.40,212.07,1092.71,221.74,1091.82,225.82C1090.94,229.91,1083.66,236.94,1084.71,239.65C1085.75,242.35,1098.62,248.79,1100.18,247.47C1101.73,246.15,1096.91,233.45,1097.12,229.12C1097.32,224.79,1099.65,216.15,1101.82,212.82C1103.99,209.49,1111.07,204.26,1114.47,202.47C1117.87,200.68,1123.05,197.04,1129.00,198.47C1134.95,199.90,1152.00,207.81,1162.06,213.94C1172.12,220.07,1200.61,240.51,1209.47,247.53C1218.33,254.54,1226.12,259.76,1232.94,270.06C1239.76,280.36,1251.86,316.39,1264.06,329.94C1276.26,343.49,1317.39,367.36,1330.53,378.47C1343.67,389.58,1361.29,408.96,1369.18,418.82C1377.06,428.69,1388.17,446.33,1393.59,457.41C1399.01,468.49,1408.78,490.82,1412.53,507.47C1416.28,524.12,1424.28,562.90,1423.59,590.59C1422.90,618.28,1408.02,703.00,1407.00,729.00C1405.98,755.00,1415.02,784.60,1415.41,798.59C1415.80,812.58,1408.65,835.65,1410.12,840.94C1411.58,846.23,1423.65,840.23,1427.12,840.88C1430.58,841.54,1435.10,843.27,1437.82,846.18C1440.54,849.08,1445.71,860.41,1448.88,864.12C1452.05,867.82,1461.00,872.18,1463.18,875.82C1465.35,879.47,1467.29,885.74,1466.29,893.29C1465.30,900.85,1457.37,930.24,1455.24,936.24C1453.10,942.23,1451.87,940.23,1449.24,941.24C1446.60,942.24,1435.38,941.95,1434.18,944.29C1432.98,946.64,1439.30,953.42,1439.65,960.00C1439.99,966.58,1438.75,989.79,1436.94,996.94C1435.13,1004.09,1428.01,1009.38,1425.18,1017.18C1422.35,1024.97,1417.15,1051.76,1414.29,1059.29C1411.44,1066.82,1401.49,1074.35,1402.35,1077.41C1403.22,1080.47,1417.95,1081.90,1421.24,1083.76C1424.52,1085.63,1427.35,1088.86,1428.65,1092.35C1429.95,1095.85,1431.60,1106.88,1431.65,1111.71C1431.69,1116.54,1431.62,1126.25,1429.00,1131.00C1426.38,1135.75,1413.51,1145.26,1410.71,1149.71C1407.90,1154.15,1408.16,1162.91,1406.53,1166.53C1404.90,1170.15,1400.49,1176.24,1397.65,1178.65C1394.81,1181.06,1387.70,1184.79,1383.82,1185.82C1379.95,1186.85,1372.60,1184.37,1366.65,1186.88C1360.70,1189.40,1339.43,1198.73,1336.24,1205.94C1333.04,1213.15,1338.77,1238.90,1341.06,1244.59C1343.35,1250.28,1352.18,1249.65,1354.53,1251.47C1356.88,1253.29,1359.68,1255.53,1359.88,1259.12C1360.09,1262.71,1358.09,1276.42,1356.18,1280.18C1354.26,1283.93,1346.29,1288.75,1344.59,1289.18C1342.89,1289.60,1344.36,1285.04,1342.59,1283.59C1340.82,1282.14,1333.01,1279.58,1330.41,1277.59C1327.81,1275.60,1323.57,1267.49,1321.76,1267.65C1319.96,1267.81,1316.64,1276.21,1316.00,1278.88C1315.36,1281.56,1317.15,1287.62,1316.65,1289.06C1316.14,1290.49,1313.70,1291.43,1311.94,1290.35C1310.18,1289.27,1303.96,1283.73,1302.59,1280.41C1301.22,1277.10,1302.55,1266.26,1301.00,1263.82C1299.45,1261.38,1293.56,1260.12,1290.18,1260.88C1286.79,1261.65,1277.99,1268.49,1273.94,1269.94C1269.89,1271.39,1266.72,1266.18,1257.76,1272.47C1248.81,1278.76,1216.60,1310.06,1202.29,1320.29C1187.99,1330.53,1156.68,1347.56,1143.35,1354.35C1130.02,1361.15,1103.75,1370.71,1095.65,1374.65C1087.54,1378.59,1082.57,1384.43,1078.53,1385.88C1074.49,1387.34,1071.35,1384.26,1063.29,1386.29C1055.24,1388.32,1024.38,1397.88,1014.12,1402.12C1003.86,1406.36,987.01,1418.04,981.24,1420.24C975.46,1422.43,970.83,1418.16,967.94,1419.65C965.05,1421.13,962.21,1429.95,958.12,1432.12C954.02,1434.29,939.68,1435.38,935.18,1437.00C930.67,1438.62,924.68,1444.09,922.06,1445.06C919.44,1446.03,919.75,1446.82,914.24,1444.76C908.72,1442.71,895.10,1429.24,877.94,1428.65C860.79,1428.05,804.04,1438.78,777.00,1440.00C749.96,1441.22,681.68,1439.07,661.59,1438.41C641.49,1437.76,630.74,1436.76,616.24,1434.76C601.73,1432.77,564.07,1427.93,545.53,1422.47C526.99,1417.01,484.26,1394.74,467.88,1391.12C451.50,1387.50,425.51,1394.07,414.47,1393.53C403.43,1392.99,389.04,1387.56,379.53,1386.82C370.01,1386.09,345.88,1388.29,338.35,1387.65C330.83,1387.00,323.59,1383.91,319.35,1381.65C315.12,1379.38,307.71,1373.19,304.47,1369.53C301.24,1365.87,297.50,1355.45,293.47,1352.35C289.44,1349.26,276.29,1347.07,272.24,1344.76C268.18,1342.46,265.64,1341.74,261.06,1333.94C256.48,1326.15,239.64,1293.24,235.59,1282.41C231.54,1271.59,229.41,1256.00,228.65,1247.35C227.88,1238.71,231.10,1218.05,229.47,1213.24C227.84,1208.42,218.04,1209.10,215.59,1208.82C213.14,1208.54,211.74,1208.03,209.88,1211.00C208.02,1213.97,201.40,1227.97,200.71,1232.59C200.01,1237.21,204.62,1246.53,204.29,1247.94C203.97,1249.35,199.32,1245.55,198.12,1243.88C196.91,1242.21,194.54,1239.54,194.65,1234.59C194.76,1229.63,201.46,1207.68,199.00,1204.24C196.54,1200.79,180.31,1207.10,175.00,1207.00C169.69,1206.90,160.82,1205.43,156.53,1203.47C152.24,1201.51,144.07,1195.20,140.71,1191.29C137.34,1187.39,133.09,1174.33,129.59,1172.24C126.09,1170.14,115.07,1172.35,112.71,1174.53C110.35,1176.71,111.74,1186.44,110.71,1189.71C109.68,1192.97,107.15,1200.68,104.47,1200.65C101.79,1200.61,93.17,1188.68,89.29,1189.41C85.42,1190.14,76.94,1204.24,73.47,1206.47C70.00,1208.70,63.37,1207.91,61.53,1207.24C59.69,1206.56,60.07,1201.67,58.76,1201.06C57.46,1200.45,52.13,1204.03,51.12,1202.35C50.10,1200.68,49.04,1191.78,50.65,1187.65C52.26,1183.51,65.18,1171.90,64.00,1169.29C62.82,1166.68,45.82,1168.59,41.24,1166.76C36.65,1164.94,29.38,1157.87,27.29,1154.71C25.21,1151.54,24.71,1143.57,24.59,1141.47C24.47,1139.38,24.68,1137.09,26.35,1137.94C28.02,1138.79,34.11,1147.66,37.94,1148.29C41.77,1148.93,56.85,1144.55,57.00,1143.00C57.15,1141.45,42.26,1137.62,39.12,1135.88C35.98,1134.15,33.76,1131.49,31.88,1129.12C30.01,1126.74,25.55,1120.32,24.12,1116.88C22.68,1113.44,20.15,1106.17,20.41,1101.59C20.68,1097.01,22.76,1083.97,26.24,1080.24C29.71,1076.50,43.96,1075.07,48.18,1071.71C52.40,1068.34,59.58,1057.70,60.00,1053.29C60.42,1048.89,52.38,1040.49,51.53,1036.47C50.68,1032.46,52.35,1024.10,53.18,1021.18C54.00,1018.26,55.71,1014.96,58.12,1013.12C60.52,1011.27,70.98,1009.44,72.41,1006.41C73.85,1003.38,69.61,992.03,69.59,988.88C69.57,985.74,69.61,983.81,72.24,981.24C74.86,978.66,88.99,972.32,90.59,968.29C92.18,964.26,85.16,956.31,85.00,949.00C84.84,941.69,89.60,914.50,89.29,909.82C88.99,905.15,84.32,910.26,82.59,911.59C80.85,912.91,77.26,914.63,75.41,920.41C73.57,926.19,70.38,950.99,67.82,957.82C65.27,964.65,58.04,973.10,55.00,975.06C51.96,977.01,45.84,974.79,43.53,973.47C41.22,972.15,38.52,968.07,36.53,964.47C34.54,960.87,28.46,949.51,27.59,944.65C26.72,939.79,27.89,929.77,29.59,925.59C31.29,921.40,35.08,914.17,41.18,911.18C47.27,908.18,74.95,906.21,78.35,901.65C81.76,897.09,69.34,880.17,68.41,874.71C67.49,869.24,69.89,861.30,70.94,857.94C71.99,854.58,73.56,850.56,76.82,847.82C80.09,845.09,91.88,838.01,97.06,836.06C102.24,834.11,119.95,837.22,118.29,832.24C116.64,827.25,90.12,804.32,83.82,796.18C77.53,788.03,70.29,773.46,67.94,767.06C65.59,760.66,64.95,751.38,65.00,745.00C65.05,738.62,69.04,724.74,68.35,716.06C67.66,707.38,60.58,683.98,59.47,675.53C58.36,667.08,57.97,658.60,59.47,648.47C60.97,638.34,66.95,609.32,71.47,594.47C75.99,579.62,90.25,541.88,95.65,529.65C101.04,517.42,108.57,504.82,114.65,496.65C120.72,488.47,136.18,474.46,144.24,464.24C152.29,454.01,176.65,422.10,179.12,414.82C181.59,407.54,167.09,408.39,164.00,406.00C160.91,403.61,155.65,397.69,154.41,395.71C153.18,393.72,153.34,391.25,154.12,390.12C154.90,388.99,157.74,387.09,160.65,386.65C163.56,386.21,173.29,385.49,177.41,386.59C181.53,387.69,192.31,395.99,193.59,395.47C194.87,394.96,187.98,385.79,187.65,382.47C187.32,379.15,189.51,370.76,190.94,368.94C192.38,367.12,197.18,366.78,199.12,367.88C201.06,368.99,191.83,390.47,206.47,377.76C221.11,365.06,297.57,284.35,316.24,266.24C334.90,248.12,346.17,240.04,355.82,232.82C365.48,225.60,387.83,217.83,393.47,208.47C399.11,199.11,397.49,169.49,400.94,157.94C404.39,146.39,417.20,121.49,421.06,116.06C424.92,110.62,424.57,117.97,431.82,114.47C439.07,110.97,464.96,93.54,479.06,88.06C493.15,82.57,530.96,72.85,544.59,70.59C558.21,68.32,575.28,69.12,588.06,69.94C600.84,70.76,630.34,72.66,646.82,77.18C663.31,81.69,705.53,99.35,719.94,106.06C734.35,112.77,754.35,125.65,762.12,130.88C769.89,136.11,777.58,144.96,782.12,147.88C786.65,150.80,795.43,153.73,798.41,154.24C801.39,154.74,801.93,154.91,805.94,151.94C809.95,148.97,824.10,133.32,830.47,130.47C836.84,127.62,851.09,127.40,856.88,129.12C862.68,130.83,873.99,141.09,876.82,144.18C879.66,147.26,879.76,150.74,879.59,153.82C879.41,156.90,874.15,165.39,875.41,168.82C876.68,172.26,885.01,175.89,889.71,181.29C894.40,186.70,907.70,206.55,912.94,212.06C918.18,217.57,925.51,223.24,931.65,225.35C937.78,227.47,956.15,229.08,962.00,229.00C967.85,228.92,981.99,227.32,978.47,224.71C974.96,222.10,941.89,212.88,933.88,208.12C925.88,203.35,917.40,191.48,914.41,186.59C911.43,181.70,910.32,173.09,910.00,169.00C909.68,164.91,910.61,157.36,911.88,153.88C913.15,150.40,917.15,144.30,920.18,141.18C923.21,138.05,935.24,131.80,936.12,128.88C936.99,125.96,930.76,119.99,927.18,117.82C923.60,115.65,910.62,114.82,907.47,111.53C904.32,108.24,901.26,95.55,902.00,91.53C902.74,87.51,908.24,81.65,913.35,79.35C918.46,77.05,935.68,72.65,942.88,73.12C950.08,73.58,966.14,80.14,970.94,83.06C975.74,85.98,980.08,96.52,981.29,96.47C982.51,96.42,980.21,85.73,980.65,82.65C981.09,79.57,981.92,74.55,984.82,71.82C987.73,69.10,999.07,62.09,1003.88,60.82ZM139.7058823529412 1225.7058823529412C145.07,1225.06,155.76,1227.18,160.53,1229.47C165.30,1231.76,176.10,1240.46,177.88,1244.00C179.66,1247.54,177.66,1255.05,174.76,1257.76C171.87,1260.48,160.48,1265.12,154.71,1265.71C148.93,1266.29,133.49,1264.32,128.59,1262.41C123.69,1260.51,116.90,1253.94,115.53,1250.47C114.16,1247.00,114.62,1237.74,117.65,1234.65C120.67,1231.55,134.35,1226.35,139.71,1225.71Z"},"5":{"width":1500,"height":1500,"bounds":[34,40,1421,1421],"path":"M34 750.5a710.5 710.5 0 1 0 1421.0 0a710.5 710.5 0 1 0 -1421.0 0Z"},"6":{"width":1500,"height":1500,"bounds":[13,15,1473,1471],"path":"M13 750.5a736.5 735.5 0 1 0 1473.0 0a736.5 735.5 0 1 0 -1473.0 0Z"}};
const museumStage=noteGallery.querySelector('.museum-stage');
const museumPanels=museumWorks.map((work,index)=>{
  const figure=document.createElement('figure');figure.className='museum-piece';figure.setAttribute('aria-hidden','true');
  const mount=document.createElement('div');mount.className='museum-artwork'+(work.cutout?' is-cutout':'');
  const image=new Image();image.alt='手绘作品《'+work.title+'》';image.draggable=false;image.decoding='async';
  if(work.mask){image.style.maskImage='url('+work.mask+')';image.style.webkitMaskImage=image.style.maskImage}
  if(work.cutout){
    const contour=museumContours[String(index+1)],bounds=contour.bounds;
    mount.style.setProperty('--art-ratio',bounds[2]/bounds[3]);
    image.style.width=(contour.width/bounds[2]*100)+'%';image.style.height=(contour.height/bounds[3]*100)+'%';
    image.style.left=(-bounds[0]/bounds[2]*100)+'%';image.style.top=(-bounds[1]/bounds[3]*100)+'%';
    const ns='http://www.w3.org/2000/svg',outline=document.createElementNS(ns,'svg');
    outline.classList.add('museum-contour');outline.setAttribute('viewBox',bounds.join(' '));outline.setAttribute('aria-hidden','true');
    ['wood','mat'].forEach(layer=>{const path=document.createElementNS(ns,'path');path.setAttribute('d',contour.path);path.setAttribute('class','contour-'+layer);path.setAttribute('vector-effect','non-scaling-stroke');outline.append(path)});
    mount.append(outline);
  }
  mount.append(image);figure.append(mount);return {figure,image,work,ready:null};
});
museumStage.replaceChildren(...museumPanels.map(panel=>panel.figure));
function prepareMuseumImage(index){
  const panel=museumPanels[index];if(!panel)return Promise.resolve();
  if(!panel.ready){
    panel.image.src=panel.work.src;
    const mask=panel.work.mask?new Image():null;if(mask)mask.src=panel.work.mask;
    panel.ready=Promise.all([panel.image.decode(),mask?mask.decode():Promise.resolve()]).catch(error=>{panel.ready=null;throw error});
  }
  return panel.ready;
}
async function setMuseumArtwork(index){
  currentMuseumWork=Math.max(0,Math.min(museumWorks.length-1,index));
  const target=currentMuseumWork,request=++museumRequest;
  $('#museum-prev').disabled=target===0;$('#museum-next').disabled=false;$('#museum-next').setAttribute('aria-label',target===museumWorks.length-1?'显示继续抽取区域':'下一张手绘作品');
  try{await prepareMuseumImage(target)}catch{if(request===museumRequest)$('#status').textContent='图片加载失败，请再次切换重试。';return}
  if(request!==museumRequest||phase!=='note-reading')return;
  museumPanels.forEach((panel,i)=>{panel.figure.classList.toggle('is-active',i===target);panel.figure.setAttribute('aria-hidden',String(i!==target))});
  $('#museum-counter').textContent=String(target+1).padStart(2,'0')+' / '+String(museumWorks.length).padStart(2,'0');
  [target-1,target+1].forEach(i=>{if(museumPanels[i])prepareMuseumImage(i).catch(()=>{})});
}
// Decode each original and its lightweight mask once, retaining panels between visits.
async function warmMuseum(){for(let i=0;i<museumWorks.length;i++){await prepareMuseumImage(i).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,60))}}
if('requestIdleCallback' in window)requestIdleCallback(warmMuseum,{timeout:1800});else setTimeout(warmMuseum,1200);
$('#museum-prev').addEventListener('click',()=>setMuseumArtwork(currentMuseumWork-1));
function advanceMuseum(){if(currentMuseumWork>=museumWorks.length-1){showNoteDrawStrip();return}setMuseumArtwork(currentMuseumWork+1)}
$('#museum-next').addEventListener('click',advanceMuseum);
window.addEventListener('keydown',event=>{if(phase!=='note-reading')return;if(event.key==='ArrowLeft'){event.preventDefault();if(noteStripOpen)hideNoteDrawStrip();else setMuseumArtwork(currentMuseumWork-1)}if(event.key==='ArrowRight'){event.preventDefault();if(!noteStripOpen)advanceMuseum()}});
noteGallery.querySelector('.museum-stage').addEventListener('touchstart',event=>{museumTouchX=event.touches.length===1?event.touches[0].clientX:null},{passive:true});
noteGallery.querySelector('.museum-stage').addEventListener('touchend',event=>{if(museumTouchX===null)return;const delta=event.changedTouches[0].clientX-museumTouchX;museumTouchX=null;if(Math.abs(delta)>55){if(delta<0)advanceMuseum();else if(noteStripOpen)hideNoteDrawStrip();else setMuseumArtwork(currentMuseumWork-1)}},{passive:true});

// Fourth capsule: both original renders remain decoded for each cord pull.
const cord=$('#light-cord'),dayModel=$('#model-day'),eveningModel=$('#model-evening');
let roomEvening=false,cordGesture=null,suppressCordClick=false,cordAnimation=null;
function hideExhibition(){walkModule?.hide();$('#exhibition-gallery').hidden=true;document.body.classList.remove('exhibition-reading')}
function hideEnding(){endingTicket++;endingModule?.cancel();$('#portfolio-ending').hidden=true;document.body.classList.remove('ending-active');endingInertState.forEach((value,node)=>node.inert=value);endingInertState.clear();if(location.hash==='#ending')history.replaceState(null,'',location.pathname+location.search)}
function hideModelGallery(){hideEnding();hideExhibition();modelGallery.hidden=true;document.body.classList.remove('model-reading')}
function setRoomLighting(evening){
  roomEvening=evening;modelGallery.classList.toggle('is-evening',evening);
  dayModel.setAttribute('aria-hidden',String(evening));eveningModel.setAttribute('aria-hidden',String(!evening));
  cord.setAttribute('aria-pressed',String(evening));cord.setAttribute('aria-label',evening?'拉动灯绳，关灯切换到白天光影':'拉动灯绳，开灯切换到傍晚光影');
  $('#model-state').textContent=evening?'傍晚 · 开灯':'白天 · 关灯';
  if(phase==='model-reading')$('#status').textContent=evening?'已开灯，场景切换为傍晚光影。':'已关灯，场景切换为白天光影。';
}
function showModelGallery(){
  hideEnding();
  hideExhibition();
  unloadFilmPlayer();
  generation++;playing.forEach(a=>a.cancel());playing=[];stopAudio();running=false;phase='model-reading';
  chapters.hidden=true;noteGallery.hidden=true;cameraGallery.hidden=true;readingShell.hidden=true;readingShell.setAttribute('aria-hidden','true');carouselControls.hidden=true;
  document.body.classList.remove('horizontal-reading','camera-reading','note-reading','note-strip-open','draw-strip-open','camera-strip-open','capsule-transitioning');
  document.body.classList.add('reading','model-reading');modelGallery.hidden=false;modelGallery.style.opacity='1';
  capsule.setAttribute('aria-hidden','true');capsule.classList.remove('ready');tvButton.disabled=true;$('#skip').hidden=false;
  cordGesture=null;suppressCordClick=false;cord.style.setProperty('--pull','0px');cord.classList.remove('is-pulling');
  setRoomLighting(false);collectCapsule('robot');window.scrollTo({top:0,behavior:'instant'});
  $('#status').textContent='场景模型已打开，向下拉动右侧灯绳，切换白天与傍晚光影。';
}
async function openRobotCapsule(){
  phase='capsule-opening';const g=generation;tvButton.disabled=true;capsule.classList.remove('ready');
  try{await Promise.all([dayModel.decode(),eveningModel.decode()])}catch{if(g===generation){phase='capsule';tvButton.disabled=false;capsule.classList.add('ready');$('#status').textContent='场景图片尚未加载完成，请再次点击扭蛋。'}return}
  if(g!==generation)return;soundContext();capsuleOpenSound();modelGallery.hidden=false;modelGallery.style.opacity='0';setRoomLighting(false);document.body.classList.add('capsule-transitioning');
  await Promise.all([
    animate(capsule,[{opacity:1,transform:'translate(0,25%) scale(1)'},{opacity:0,transform:'translate(0,25%) scale(1.16)'}],{duration:650,easing:'ease-out'}),
    animate(outlet,[{opacity:1},{opacity:0}],{duration:500,easing:'ease-out'}),
    animate(modelGallery,[{opacity:0},{opacity:1}],{duration:720,easing:'ease-out'})
  ]);if(g===generation)showModelGallery();
}
function bounceCord(from=0){
  cordAnimation?.cancel();
  if(reduced.matches)return;
  cordAnimation=cord.animate([{'--pull':from+'px'},{'--pull':'-6px',offset:.55},{'--pull':'0px'}],{duration:360,easing:'ease-out'});
}
function toggleRoomLight(){if(phase!=='model-reading')return;setRoomLighting(!roomEvening);soundContext();metalHit(ctx?.currentTime||0,roomEvening?740:480,.03,.08)}
cord.addEventListener('pointerdown',event=>{
  if(phase!=='model-reading'||(event.pointerType==='mouse'&&event.button!==0))return;
  cordAnimation?.cancel();cordGesture={id:event.pointerId,start:event.clientY,delta:0};suppressCordClick=false;cord.classList.add('is-pulling');cord.setPointerCapture(event.pointerId);
});
cord.addEventListener('pointermove',event=>{
  if(!cordGesture||event.pointerId!==cordGesture.id)return;
  cordGesture.delta=Math.max(0,Math.min(88,event.clientY-cordGesture.start));cord.style.setProperty('--pull',cordGesture.delta+'px');
});
function finishCord(event,cancelled=false){
  if(!cordGesture||event.pointerId!==cordGesture.id)return;
  const delta=cordGesture.delta;cordGesture=null;cord.classList.remove('is-pulling');cord.style.setProperty('--pull','0px');
  if(cord.hasPointerCapture(event.pointerId))cord.releasePointerCapture(event.pointerId);
  if(!cancelled&&delta>=28){suppressCordClick=true;toggleRoomLight()}else if(delta>6)suppressCordClick=true;
  bounceCord(delta);
}
cord.addEventListener('pointerup',event=>finishCord(event));cord.addEventListener('pointercancel',event=>finishCord(event,true));
cord.addEventListener('click',event=>{if(suppressCordClick&&event.detail!==0){suppressCordClick=false;return}suppressCordClick=false;toggleRoomLight();bounceCord(40)});

// Load the real 3D scene only when the visitor chooses the exhibition.
async function showExhibition(){
 unloadFilmPlayer();stopAudio();phase='exhibition-reading';modelGallery.hidden=true;
 document.body.classList.remove('model-reading');document.body.classList.add('exhibition-reading');$('#exhibition-gallery').hidden=false;
 try{
  walkImport??=import('./exhibition.bundle.js?v=35');walkModule=await walkImport;
  if(phase==='exhibition-reading'){await walkModule.open();$('#walk-finish').disabled=false}
 }catch{$('#walk-loading').textContent='三维空间暂时无法载入，可返回查看场景光影。';$('#walk-retry').hidden=false}
}
$('#open-exhibition').addEventListener('click',showExhibition);
$('#walk-back').addEventListener('click',showModelGallery);

async function showEnding(snapshot=null){
 const ticket=++endingTicket;
 generation++;running=false;stopAudio();unloadFilmPlayer();walkModule?.hide();phase='ending-transition';
 document.body.classList.add('ending-active');$('#walk-finish').disabled=true;
 document.querySelectorAll('#experience > :not(#portfolio-ending)').forEach(node=>{if(!endingInertState.has(node))endingInertState.set(node,node.inert);node.inert=true});
 try{
  endingImport??=import('./ending.js?v=35');endingModule=await endingImport;
  if(ticket!==endingTicket)return;
  await endingModule.play(snapshot);
  if(ticket!==endingTicket)return;
  phase='ending';hideExhibition();history.replaceState(null,'','#ending');
 }catch(error){
  if(ticket!==endingTicket)return;
  console.error('Ending transition unavailable',error);
  const end=$('#portfolio-ending');end.hidden=false;end.classList.add('is-complete');end.setAttribute('aria-busy','false');
  $('#ending-particles').hidden=true;$('#ending-capsules').inert=false;phase='ending';hideExhibition();
 }
}
$('#walk-finish').addEventListener('click',()=>{if(phase==='exhibition-reading')showEnding(walkModule?.captureForEnding())});
$('#ending-capsules').addEventListener('click',event=>{
 const button=event.target.closest('[data-ending-capsule]');if(!button||phase!=='ending')return;
 const type=button.dataset.endingCapsule;hideEnding();
 if(type==='tv'){reveal('preparation');collectCapsule('tv')}
 else if(type==='camera')showCameraGallery(0);
 else if(type==='note')showNoteGallery();
 else showModelGallery();
});
window.addEventListener('hashchange',()=>{if(location.hash==='#ending'&&!phase.startsWith('ending'))showEnding()});
