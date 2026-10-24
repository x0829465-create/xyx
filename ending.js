const screen=document.querySelector('#portfolio-ending');
const artwork=document.querySelector('#ending-artwork');
const canvas=document.querySelector('#ending-particles');
const row=document.querySelector('#ending-capsules');
let raf=0,resolveRun=null,runId=0;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;

export function cancel(){
 runId++;cancelAnimationFrame(raf);resolveRun?.();resolveRun=null;
 screen.hidden=true;screen.classList.remove('is-complete','is-settled');canvas.hidden=true;
 row.inert=true;row.querySelectorAll('button').forEach(b=>b.style.animation='');
}
export async function play(source){
 cancel();const id=runId;screen.style.setProperty('--ending-reveal','0');screen.hidden=false;screen.setAttribute('aria-busy','true');
 row.inert=true;screen.dataset.transition='preparing';
 document.querySelector('#ending-message').textContent='正在将展厅化为粒子，聚合结束画面。';
 artwork.loading='eager';
 try{await artwork.decode()}catch{screen.dataset.transition='image-error'}
 if(id!==runId)return;
 const finish=()=>{
  if(id!==runId)return;
  canvas.hidden=true;screen.classList.add('is-complete');screen.dataset.transition='complete';screen.setAttribute('aria-busy','false');row.inert=false;
  document.querySelector('#ending-message').textContent='参观完成。四枚扭蛋已归位，点击即可回看对应作品。';
  screen.setAttribute('tabindex','-1');screen.focus({preventScroll:true});
 };
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||!source){finish();return}
 const context=canvas.getContext('2d',{alpha:false});
 if(!context){finish();return}
 const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio,1.5);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);context.setTransform(dpr,0,0,dpr,0,0);canvas.hidden=false;
 // A bounded grid samples both the live exhibition and the final artwork.
 const count=w<760?6500:13000,step=Math.sqrt(w*h/count),cols=Math.ceil(w/step),rows=Math.ceil(h/step);
 const sample=document.createElement('canvas');sample.width=cols;sample.height=rows;
 const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(source,0,0,cols,rows);
 const from=sc.getImageData(0,0,cols,rows).data;
 sc.fillStyle='#28242e';sc.fillRect(0,0,cols,rows);
 // Use the exact same image bounds as the finished page, including portrait screens.
 if(artwork.naturalWidth){
  const cover=Math.max(cols/artwork.naturalWidth,rows/artwork.naturalHeight);
  sc.globalAlpha=.4;sc.drawImage(artwork,(cols-artwork.naturalWidth*cover)/2,(rows-artwork.naturalHeight*cover)/2,artwork.naturalWidth*cover,artwork.naturalHeight*cover);sc.globalAlpha=1;
  const r=artwork.getBoundingClientRect();sc.drawImage(artwork,r.x/w*cols,r.y/h*rows,r.width/w*cols,r.height/h*rows);
 }
 const to=sc.getImageData(0,0,cols,rows).data;
 const particles=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const p=(y*cols+x)*4,px=(x+.5)/cols*w,py=(y+.5)/rows*h,angle=Math.random()*Math.PI*2;
  particles.push({x:px,y:py,dx:Math.cos(angle)*(w*.2+Math.random()*w*.55),dy:Math.sin(angle)*(h*.25+Math.random()*h*.55),bend:(Math.random()-.5)*130,delay:Math.random()*.13,a:[from[p],from[p+1],from[p+2]],b:[to[p],to[p+1],to[p+2]]});
 }
 const started=performance.now(),duration=5600;
 screen.dataset.transition='dispersing';
 await new Promise(resolve=>{
  resolveRun=resolve;
  const frame=now=>{
   if(id!==runId){resolve();return}
   const t=clamp((now-started)/duration),out=ease(t/.48),inward=ease((t-.43)/.52),scatter=out*(1-inward),color=ease((t-.36)/.44);
   screen.dataset.transition=t<.48?'dispersing':'assembling';
   context.fillStyle='#1b1c20';context.fillRect(0,0,w,h);
   if(t<.13){context.globalAlpha=1-ease(t/.13);context.drawImage(source,0,0,w,h);context.globalAlpha=1}
   for(const p of particles){
    const spread=clamp(scatter*(1+p.delay));
    const x=p.x+p.dx*spread,y=p.y+p.dy*spread+Math.sin(t*Math.PI*2)*p.bend*spread;
    const size=step*(1.08-spread*.76);
    context.fillStyle=`rgb(${mix(p.a[0],p.b[0],color)|0},${mix(p.a[1],p.b[1],color)|0},${mix(p.a[2],p.b[2],color)|0})`;
    context.fillRect(x-size/2,y-size/2,size,size);
   }
   // Resolve the last grid into the original full-resolution photograph.
   canvas.style.opacity=String(1-ease((t-.9)/.1));screen.style.setProperty('--ending-reveal',String(ease((t-.9)/.1)));
   if(t<1)raf=requestAnimationFrame(frame);else{resolveRun=null;finish();resolve()}
  };
  canvas.style.opacity='1';screen.style.setProperty('--ending-reveal','0');raf=requestAnimationFrame(frame);
 });
}
