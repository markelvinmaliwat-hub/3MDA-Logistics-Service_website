(function(){const h=document.documentElement,mt=document.querySelector('meta[name=viewport]'),b=document.getElementById('vsw');
let v=null;try{v=localStorage.getItem('mm_view')}catch(e){}
if(v!=='m'&&v!=='w')v=Math.min(screen.width,innerWidth)<=900?'m':'w';
const apply=()=>{h.classList.toggle('vm',v==='m');h.classList.toggle('vw',v==='w');
 mt.setAttribute('content',v==='m'?'width=device-width, initial-scale=1, viewport-fit=cover':'width=1200, viewport-fit=cover');
 b.textContent=v==='m'?'\uD83D\uDDA5 Switch to Web view':'\uD83D\uDCF1 Switch to Mobile view'};
b.onclick=()=>{v=v==='m'?'w':'m';try{localStorage.setItem('mm_view',v)}catch(e){}apply();try{logEv('VIEW MODE','View',v==='m'?'Mobile view':'Web view')}catch(e){}};
apply()})();
