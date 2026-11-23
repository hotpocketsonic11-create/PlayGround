const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
let W,H,DPR,keys={},started=false,paused=false,gameOver=false;
function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}addEventListener('resize',resize);resize();
const world={w:6200,h:900};
const player={x:180,y:400,w:34,h:48,vx:0,vy:0,ground:false,spin:false,rings:0,score:0,inv:0,life:3,checkpoint:180};
const rings=[],enemies=[],springs=[],platforms=[],palms=[],clouds=[];
function ring(x,y){rings.push({x,y,taken:false,a:Math.random()*6})}
function enemy(x,y){enemies.push({x,y,v:-55,alive:true,t:0})}
function spring(x,y){springs.push({x,y})}
function plat(x,y,w,h=34){platforms.push({x,y,w,h})}
plat(0,650,1000,250); plat(1120,650,700,250); plat(1940,650,1200,250); plat(3260,650,1000,250); plat(4380,650,1820,250);
plat(850,520,170,28);plat(1280,500,180,28);plat(1700,560,160,28);plat(2180,480,220,28);plat(2800,540,170,28);plat(3480,520,180,28);plat(3820,430,220,28);plat(4700,520,200,28);plat(5050,430,180,28);
for(let x=520;x<980;x+=55)ring(x,560);for(let x=1200;x<1880;x+=70)ring(x,x<1450?470:560);for(let x=2050;x<3000;x+=65)ring(x,410+(Math.sin(x/180)*60));for(let x=3300;x<4250;x+=62)ring(x,510);for(let x=4550;x<5900;x+=65)ring(x,420+(Math.cos(x/180)*70));
enemy(980,610);enemy(1550,610);enemy(2440,610);enemy(3000,610);enemy(3580,610);enemy(4200,610);enemy(4800,610);enemy(5300,610);spring(2850,616);spring(4080,616);spring(4880,616);
for(let i=0;i<14;i++)palms.push({x:180+i*420,y:650-Math.random()*70,s:0.8+Math.random()*0.5});
for(let i=0;i<18;i++)clouds.push({x:i*380+(i%3)*80,y:85+(i*97)%210,s:0.7+(i%4)*.15});
let startTime=0,last=performance.now(),cameraX=0,won=false;
function rects(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function reset(){player.x=player.checkpoint;player.y=400;player.vx=0;player.vy=0;player.inv=120}
function update(dt){if(!started||paused||won)return;if(player.life<=0){paused=true;document.getElementById('overlay').style.display='flex';document.querySelector('.card h1').textContent='TRY AGAIN';document.querySelector('.card p').textContent='The badniks got you this time.';document.getElementById('start').textContent='RESTART';gameOver=true;return}
const left=keys.ArrowLeft||keys.KeyA||keys.left,right=keys.ArrowRight||keys.KeyD||keys.right,jump=keys.ArrowUp||keys.KeyW||keys.Space||keys.jump;
if(left){player.vx-=900*dt;if(player.vx<-560)player.vx=-560}if(right){player.vx+=900*dt;if(player.vx>560)player.vx=560}if(!left&&!right){player.vx*=Math.pow(.09,dt);if(Math.abs(player.vx)<4)player.vx=0}
if(jump&&player.ground&&!player.jumpHeld){player.vy=-620;player.ground=false;player.spin=true}player.jumpHeld=jump;if(!jump&&player.vy<-260)player.vy+=900*dt;
player.vy+=1450*dt;player.vy=Math.min(player.vy,850);player.x+=player.vx*dt;player.y+=player.vy*dt;player.x=Math.max(10,Math.min(world.w-player.w-10,player.x));
player.ground=false;for(const p of platforms){if(player.vy>=0&&player.x+player.w>p.x&&player.x<p.x+p.w&&player.y+player.h>=p.y&&player.y+player.h-p.vy*dt<=p.y+8){player.y=p.y-player.h;player.vy=0;player.ground=true;player.spin=false;if(p.y>620&&p===platforms[0])player.checkpoint=180}} 
for(const r of rings){if(!r.taken){r.a+=dt*5;const dx=player.x+17-r.x,dy=player.y+24-r.y;if(dx*dx+dy*dy<1250){r.taken=true;player.rings++;player.score+=100}}}
for(const e of enemies){if(!e.alive)continue;e.t+=dt;e.x+=e.v*dt;if(e.x<180||e.x>5900)e.v*=-1;if(rects(player,{x:e.x,y:e.y,w:44,h:38}))if(player.spin||player.vy>150&&player.y+player.h<e.y+22){e.alive=false;player.vy=-300;player.score+=500}else damage()}
for(const s of springs){if(rects(player,{x:s.x,y:s.y,w:48,h:34}))if(player.vy>=0||rects(player,{x:s.x,y:s.y,w:48,h:34})) {player.vy=-820;player.ground=false}}
if(player.y>820)damage(true);if(player.inv>0)player.inv-=dt*60;if(player.x>5920&&player.y<700){won=true;paused=true;player.score+=Math.max(0,5000-Math.floor((performance.now()-startTime)/100));document.querySelector('.card h1').textContent='ZONE CLEAR!';document.querySelector('.card p').textContent=`Score ${player.score} • Rings ${player.rings}`;document.getElementById('start').textContent='PLAY AGAIN';document.getElementById('overlay').style.display='flex'}
if(performance.now()-startTime>0){} }
function damage(fall=false){if(player.inv>0)return;if(fall||player.rings===0){player.life--;player.rings=0;player.checkpoint=Math.max(180,player.x-300);reset()}else{player.rings=0;player.inv=120;player.vy=-420}}
const sky=ctx;
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function draw(){ctx.clearRect(0,0,W,H);const sh=Math.min(W/1280,H/720);const vh=720,viewH=Math.min(H/vh,1);cameraX+=(((player.x-W*.42)-cameraX)*.08);cameraX=Math.max(0,Math.min(world.w-W,cameraX));ctx.save();ctx.scale(W/1280,H/720);ctx.translate(-cameraX*(1280/W),0)
// sky is already in logical canvas dimensions; simpler layered rendering
ctx.fillStyle='#37a7ef';ctx.fillRect(0,0,1280,720);ctx.restore();drawWorld()}
function drawWorld(){ctx.save();ctx.scale(W/1280,H/720);ctx.translate(-cameraX,0);
ctx.fillStyle='#37a7ef';ctx.fillRect(cameraX,0,1280,720);for(const c of clouds){ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.ellipse(c.x,c.y,46*c.s,17*c.s,0,0,7);ctx.ellipse(c.x-30*c.s,c.y+8*c.s,30*c.s,14*c.s,0,0,7);ctx.ellipse(c.x+35*c.s,c.y+8*c.s,34*c.s,14*c.s,0,0,7);ctx.fill()} 
ctx.fillStyle='#bde56a';ctx.beginPath();ctx.moveTo(cameraX,650);for(let x=cameraX-100;x<cameraX+1380;x+=80){ctx.quadraticCurveTo(x+40,520-Math.sin(x*.012)*70,x+80,650)}ctx.lineTo(cameraX+1380,720);ctx.closePath();ctx.fill();
for(const p of palms){ctx.fillStyle='#9b5b25';ctx.fillRect(p.x,p.y-55*p.s,12*p.s,55*p.s);ctx.fillStyle='#31a82c';for(let i=0;i<6;i++){ctx.save();ctx.translate(p.x+6*p.s,p.y-55*p.s);ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.ellipse(28*p.s,0,38*p.s,10*p.s,.2,0,7);ctx.fill();ctx.restore()}} 
for(const p of platforms){ctx.fillStyle='#df9a36';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle='#277d25';ctx.fillRect(p.x,p.y,p.w,18);ctx.fillStyle='#68c43b';ctx.fillRect(p.x,p.y,p.w,7);ctx.fillStyle='#7d5528';for(let x=p.x;x<p.x+p.w;x+=36){ctx.beginPath();ctx.moveTo(x,p.y+18);ctx.lineTo(x+18,p.y+38);ctx.lineTo(x+36,p.y+18);ctx.fill()}}
for(const r of rings){if(r.taken)continue;ctx.save();ctx.translate(r.x,r.y);ctx.scale(.55+Math.abs(Math.cos(r.a))*0.45,1);ctx.strokeStyle='#ffe24b';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,18,0,7);ctx.stroke();ctx.strokeStyle='#b77712';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14,0,7);ctx.stroke();ctx.restore()}
for(const e of enemies){if(!e.alive)continue;ctx.fillStyle='#dce8ec';roundRect(e.x,e.y,44,38,9);ctx.fill();ctx.fillStyle='#e74b38';ctx.fillRect(e.x+5,e.y+12,34,12);ctx.fillStyle='#26324a';ctx.fillRect(e.x+9,e.y+24,7,7);ctx.fillRect(e.x+28,e.y+24,7,7);ctx.fillStyle='#fff';ctx.fillRect(e.x+13,e.y+7,16,7)}
for(const s of springs){ctx.fillStyle='#e9c84a';ctx.fillRect(s.x,s.y+14,48,20);ctx.fillStyle='#d84e33';ctx.fillRect(s.x,s.y,48,14);ctx.fillStyle='#fff';ctx.fillRect(s.x+7,s.y+17,34,5)}
ctx.fillStyle='#245bb3';ctx.fillRect(5900,520,20,130);ctx.fillStyle='#ffe45a';ctx.beginPath();ctx.arc(5910,510,34,0,7);ctx.fill();ctx.fillStyle='#f45138';ctx.fillRect(5898,474,24,42);
// player
if(player.inv<=0||Math.floor(player.inv/8)%2===0){ctx.save();ctx.translate(player.x+17,player.y+24);if(player.vx<0)ctx.scale(-1,1);ctx.rotate(player.spin?performance.now()/90:0);ctx.fillStyle='#1d58be';ctx.beginPath();ctx.ellipse(0,12,22,19,0,0,7);ctx.fill();ctx.fillStyle='#2469cf';ctx.beginPath();ctx.moveTo(-15,-20);ctx.lineTo(-28,-45);ctx.lineTo(-5,-27);ctx.moveTo(15,-20);ctx.lineTo(28,-45);ctx.lineTo(5,-27);ctx.fill();ctx.fillStyle='#2477dd';ctx.beginPath();ctx.ellipse(0,-12,16,20,0,0,7);ctx.fill();ctx.fillStyle='#f5ae72';ctx.beginPath();ctx.ellipse(0,-6,12,11,0,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(-5,-14,5,8,0,0,7);ctx.ellipse(5,-14,5,8,0,0,7);ctx.fill();ctx.fillStyle='#1a3c70';ctx.beginPath();ctx.arc(-3,-14,2,0,7);ctx.arc(7,-14,2,0,7);ctx.fill();ctx.fillStyle='#e8b33b';ctx.beginPath();ctx.ellipse(0,20,17,7,0,0,7);ctx.fill();ctx.restore()}
ctx.restore();document.getElementById('score').textContent=String(player.score).padStart(6,'0');document.getElementById('rings').textContent='RINGS  '+String(player.rings).padStart(2,'0');let sec=Math.floor((performance.now()-startTime)/1000);document.getElementById('time').textContent='TIME  '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')}
function loop(now){let dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.prevent} );
addEventListener('keyup',e=>keys[e.code]=false);
document.querySelectorAll('.btn').forEach(b=>{const k=b.dataset.key;const on=e=>{e.preventDefault();keys[k]=true};const off=e=>{e.preventDefault();keys[k]=false};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off)});
document.getElementById('start').addEventListener('click',()=>{document.getElementById('overlay').style.display='none';if(gameOver){location.reload();return}if(!started){started=true;startTime=performance.now()}if(won){location.reload()}paused=false});
