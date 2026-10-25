const buttons=[...document.querySelectorAll('[data-mode]')];
const note=document.getElementById('mode-note');let fontFailure=false;
function select(mode){document.documentElement.dataset.type=mode;for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.mode===mode));note.textContent=fontFailure?'部分字体未能加载，当前显示备用字体，请刷新后再比较。':mode==='proposed'?'正在预览：得意黑 + IBM Plex 字体家族':'正在对比：当前网站的系统黑体搭配';}
buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.mode)));
document.querySelector('.comparison').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:(buttons.indexOf(document.activeElement)+1)%2;buttons[next].focus();select(buttons[next].dataset.mode);});
const input=document.getElementById('type-input');input.addEventListener('input',()=>{document.getElementById('custom-specimen').textContent=input.value||'从结构，看懂机台。';});
document.fonts.ready.then(()=>{fontFailure=[...document.fonts].some(font=>font.status==='error');document.documentElement.dataset.fontsReady=fontFailure?'fallback':'true';select(document.documentElement.dataset.type);});
document.getElementById('smiley-license').href=new URL('./fonts/SmileySans-LICENSE.txt',import.meta.url).href;
document.getElementById('plex-license').href=new URL('./fonts/IBMPlex-LICENSE.txt',import.meta.url).href;
