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
 const markers=[marker], pending=[], active=[];
 const nav=new scope.module.exports.VirtualizedTimelineNavigation(()=>viewport,()=>markers,id=>active.push(id),id=>pending.push(id));
 nav.prepare(viewport);nav.measure();element.isConnected=false;
 return {nav,element,viewport,calls,timers,markers,pending,active,setTop:n=>top=n,setHeight:n=>height=n,wheel(){listeners.get('wheel')?.();}, tick(){now+=80;const next=timers.values().next().value;next?.();}};
}
test('unmounted target initially lands at cached centre; exact remount does not scroll again',()=>{
 const f=fixture();f.nav.navigateTo('target');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].top,4620);assert.equal(f.calls[0].behavior,'instant');
 f.element.isConnected=true;[...f.timers.values()][0]();
 assert.equal(f.calls.length,1);f.nav.destroy();
});
test('changed layout gets an instant centre correction instead of a second smooth animation',()=>{
 const f=fixture();f.nav.navigateTo('target');f.element.isConnected=true;f.setTop(6030);for(let i=0;i<4;i++)f.tick();
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].top,5650);assert.equal(f.calls[1].behavior,'instant');f.nav.destroy();
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
 f.element.isConnected=true;f.setTop(2030);for(let i=0;i<4;i++)f.tick();
 assert.equal(f.calls[1].top,1650);assert.equal(f.calls[1].behavior,'instant');f.nav.destroy();
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
 f.element.isConnected=true;f.setTop(6030);for(let i=0;i<25;i++)f.tick();
 assert.equal(f.calls.length,1);
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
   f.setTop(top+900);for(let i=0;i<4;i++)f.tick();
   assert.equal(f.calls[1].behavior,'instant');assert.equal(f.calls[1].top,top+520);
  }
  f.nav.destroy();
 }
});

test('long reply without a visible user bubble still probes a distant target in both directions',()=>{
 for(const reverse of [false,true]){
  const f=fixture();
  const neighbor={id:'neighbor',center:reverse?8020:120,element:{isConnected:true,getBoundingClientRect:()=>({top:(reverse?8000:100)-f.viewport.scrollTop,bottom:(reverse?8040:140)-f.viewport.scrollTop,height:40,width:400})}};
  if(reverse)f.markers.push(neighbor);else f.markers.unshift(neighbor);
  f.viewport.scrollTop=reverse?7000:800;
  f.nav.navigateTo('target');
  assert.equal(f.calls.length,1,'must not wait for an onscreen user bubble');
  f.element.isConnected=true;
  for(let i=0;i<6;i++)f.tick();
  assert.equal(f.viewport.scrollTop,4620);assert.equal(f.timers.size,0);f.nav.destroy();
 }
});
test('loading is delayed, absent on a fast arrival, and cleared by user cancellation',()=>{
 const f=fixture();f.nav.navigateTo('target');
 assert.ok(!f.pending.includes('target'));f.tick();f.tick();
 assert.ok(!f.pending.includes('target'));f.tick();
 assert.ok(f.pending.includes('target'));f.wheel();assert.equal(f.pending.at(-1),null);f.nav.destroy();
 const fast=fixture();fast.element.isConnected=true;fast.nav.navigateTo('target');
 for(let i=0;i<6;i++)fast.tick();
 assert.ok(!fast.pending.includes('target'));fast.nav.destroy();
});
test('timeout clears loading and restores the selection to the actual viewport',()=>{
 const f=fixture();f.markers.unshift({id:'visible',center:500,element:{isConnected:true,getBoundingClientRect:()=>({top:480-f.viewport.scrollTop,bottom:520-f.viewport.scrollTop,height:40,width:400})}});
 f.nav.navigateTo('target');
 for(let i=0;i<105;i++)f.tick();
 assert.equal(f.pending.at(-1),null);assert.equal(f.timers.size,0);assert.notEqual(f.active.at(-1),'target');f.nav.destroy();
});

test('a newer click replaces old pending navigation and its loading indicator',()=>{
 const f=fixture();f.nav.navigateTo('target');for(let i=0;i<3;i++)f.tick();
 const next={id:'next',center:1020,element:{isConnected:true,getBoundingClientRect:()=>({top:1000-f.viewport.scrollTop,bottom:1040-f.viewport.scrollTop,height:40,width:400})}};
 f.markers.unshift(next);f.nav.navigateTo('next');
 assert.equal(f.pending.at(-1),null);
 f.element.isConnected=true;f.setTop(8000);
 for(let i=0;i<10;i++)f.tick();
 assert.equal(f.viewport.scrollTop,620);assert.equal(f.timers.size,0);f.nav.destroy();
});
test('layout shifts after two corrections are still aligned before navigation ends',()=>{
 const f=fixture();f.element.isConnected=true;f.nav.navigateTo('target');
 for(const top of [5900,6800,7700]){
  f.setTop(top);for(let i=0;i<4;i++)f.tick();
  assert.equal(f.viewport.scrollTop,top-380);
 }
 for(let i=0;i<5;i++)f.tick();assert.equal(f.timers.size,0);f.nav.destroy();
});

test('a readable off-center target stops without another jump',()=>{
 const f=fixture();f.nav.navigateTo('target');f.element.isConnected=true;f.setTop(5030);
 f.tick();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.nav.destroy();
});
test('first message at the top needs no centering correction',()=>{
 const f=fixture();f.element.isConnected=true;f.setTop(0);f.nav.navigateTo('target');
 f.tick();assert.equal(f.viewport.scrollTop,0);assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.nav.destroy();
});
