import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
const bundle=await build({entryPoints:['vendor/features/timeline/VirtualizedTimelineNavigation.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
function fixture(){
 const calls=[],timers=new Map(),listeners=new Map();let timerId=0, now=0;
 const viewport={scrollTop:0,scrollHeight:10000,clientHeight:800,addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({top:0}),scrollTo(o){calls.push(o);this.scrollTop=o.top;}};
 const win={matchMedia:()=>({matches:false}),addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},setTimeout(fn){const id=++timerId;timers.set(id,()=>{timers.delete(id);fn();});return id;},clearTimeout(id){timers.delete(id);}};
 let top=5000,height=40;
 const element={isConnected:true,getBoundingClientRect:()=>({top:top-viewport.scrollTop,bottom:top-viewport.scrollTop+height,height,width:400,left:100,right:500})};
 const marker={id:'target',element};
 const scope={module:{exports:{}},window:win,document:{documentElement:{},body:{},querySelectorAll:()=>[]},AbortController,Date:class extends Date {static now(){return now;}},getComputedStyle:()=>({display:'block',flexDirection:'column',scrollPaddingTop:'64px'})};
 vm.runInNewContext(bundle.outputFiles[0].text,scope);
 const nav=new scope.module.exports.VirtualizedTimelineNavigation(()=>viewport,()=>[marker],()=>{});
 nav.prepare(viewport);nav.measure();element.isConnected=false;
 return {nav,element,viewport,calls,timers,setTop:n=>top=n,setHeight:n=>height=n,wheel(){listeners.get('wheel')?.();}, tick(){now+=80;const next=timers.values().next().value;next?.();}};
}
test('unmounted target initially lands at cached centre; exact remount does not scroll again',()=>{
 const f=fixture();f.nav.navigateTo('target');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].top,4620);assert.equal(f.calls[0].behavior,'instant');
 f.element.isConnected=true;[...f.timers.values()][0]();
 assert.equal(f.calls.length,1);f.nav.destroy();
});
test('changed layout gets an instant centre correction instead of a second smooth animation',()=>{
 const f=fixture();f.nav.navigateTo('target');f.element.isConnected=true;f.setTop(5030);for(let i=0;i<4;i++)f.tick();
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].top,4650);assert.equal(f.calls[1].behavior,'instant');f.nav.destroy();
});

test('nearby mounted target jumps immediately to center',()=>{
 const f=fixture();f.setTop(1000);f.element.isConnected=true;f.nav.measure();f.nav.navigateTo('target');
 assert.equal(f.calls[0].top,620);assert.equal(f.calls[0].behavior,'instant');
 assert.equal(f.calls.length,1);f.nav.destroy();
});
test('nearby target uses instant scroll',()=>{
 const f=fixture();f.setTop(1000);f.element.isConnected=true;f.nav.measure();f.nav.navigateTo('target');
 assert.equal(f.calls[0].behavior,'instant');f.nav.destroy();
});
test('distant mounted target jumps and needs no correction when it lands centered',()=>{
 const f=fixture();f.element.isConnected=true;f.nav.navigateTo('target');
 assert.equal(f.calls[0].behavior,'instant');assert.equal(f.calls[0].top,4620);
 f.viewport.scrollTop=4620;for(let i=0;i<5;i++)f.tick();
 assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.nav.destroy();
});
test('unmounted target uses jump even when its cached position is nearby',()=>{
 const f=fixture();f.element.isConnected=true;f.setTop(1000);f.nav.measure();f.element.isConnected=false;f.nav.navigateTo('target');
 assert.equal(f.calls[0].top,620);assert.equal(f.calls[0].behavior,'instant');
 f.element.isConnected=true;f.setTop(1030);for(let i=0;i<4;i++)f.tick();
 assert.equal(f.calls[1].top,650);assert.equal(f.calls[1].behavior,'instant');f.nav.destroy();
});
test('near and far targets all jump without animation',()=>{
 for(const [top,behavior] of [[2780,'instant'],[2781,'instant'],[5000,'instant']]){
  const f=fixture();f.element.isConnected=true;f.setTop(top);f.nav.measure();f.nav.navigateTo('target');
  assert.equal(f.calls[0].behavior,behavior);assert.equal(f.calls[0].top,top+20-400);f.nav.destroy();
 }
});
test('navigation is instant by default',()=>{
 const f=fixture();f.element.isConnected=true;f.setTop(1000);f.nav.measure();f.nav.navigateTo('target');
 assert.equal(f.calls[0].behavior,'instant');f.nav.destroy();
});
test('destroying pending navigation prevents delayed corrections',()=>{
 const f=fixture();f.nav.navigateTo('target');f.nav.destroy();
 f.element.isConnected=true;f.setTop(5030);for(let i=0;i<25;i++)f.tick();
 assert.equal(f.calls.length,1);
});

test('one click tracks a target that shifts during layout changes and corrects only after settling',()=>{
 const f=fixture();f.element.isConnected=true;f.nav.navigateTo('target');
 for(let i=0;i<20;i++){
  f.viewport.scrollTop+=150;
  if(i===5)f.setTop(5600);
  f.tick();
 }
 assert.equal(f.calls.length,1,'no in-flight correction');
 f.viewport.scrollTop=4620;
 for(let i=0;i<5;i++)f.tick();
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].top,5220);assert.equal(f.calls[1].behavior,'instant');
 f.viewport.scrollTop=5220;for(let i=0;i<5;i++)f.tick();
 assert.equal(f.calls.length,2);assert.equal(f.timers.size,0);f.nav.destroy();
});
test('connected zero-height placeholder is not treated as a loaded target',()=>{
 const f=fixture();f.element.isConnected=true;f.setHeight(0);f.nav.navigateTo('target');
 assert.equal(f.calls[0].behavior,'instant');
 f.setHeight(40);for(let i=0;i<5;i++)f.tick();assert.equal(f.calls.length,1);f.nav.destroy();
});
test('hidden connected element uses discovery instead of smooth scrolling',()=>{
 const f=fixture();f.element.isConnected=true;f.element.checkVisibility=()=>false;
 f.nav.navigateTo('target');assert.equal(f.calls[0].behavior,'instant');f.nav.destroy();
});
test('user wheel input cancels pending pending correction',()=>{
 const f=fixture();f.element.isConnected=true;f.nav.navigateTo('target');
 f.setTop(5600);f.wheel();f.viewport.scrollTop=4620;
 for(let i=0;i<20;i++)f.tick();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.nav.destroy();
});

test('distance does not change instant navigation or correction',()=>{
 for(const [top,behavior] of [[5180,'instant'],[5181,'instant']]){
  const f=fixture();f.element.isConnected=true;f.setTop(top);f.nav.measure();f.nav.navigateTo('target');
  assert.equal(f.calls[0].behavior,behavior);assert.equal(f.calls[0].top,top-380);
  if(behavior==='instant'){
   f.setTop(top+30);for(let i=0;i<4;i++)f.tick();
   assert.equal(f.calls[1].behavior,'instant');assert.equal(f.calls[1].top,top-350);
  }
  f.nav.destroy();
 }
});
