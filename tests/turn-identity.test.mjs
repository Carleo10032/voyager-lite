import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';
const bundled=await build({entryPoints:['vendor/features/timeline/adapters/catalog/turnMerge.ts'],bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':path.resolve('vendor')}});
const scope={module:{exports:{}}};
vm.runInNewContext(bundled.outputFiles[0].text,scope);
const {mergeMountedTurns,rememberedMarkers}=scope.module.exports;
function turn(hostTurnId,summary,center){
 const attrs=new Map();
 return {hostTurnId,summary,element:{isConnected:true,center,getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v)}};
}
const merge=(known,turns)=>mergeMountedTurns(rememberedMarkers(known,turns),turns,e=>e.center);
const unmount=turns=>turns.forEach(t=>t.element.isConnected=false);
test('distinct identical prompts keep separate native identities across virtualized windows',()=>{
 const first=[turn('a','继续梳理吧',0),turn('b','ok',100)];
 let known=merge([],first);const firstOk=known[1].id;unmount(first);
 const next=[turn('c','可以',200),turn('d','ok',300)];
 known=merge(known,next);
 assert.equal(known.length,4);
 assert.equal(known.find(m=>m.hostTurnId==='b').id,firstOk);
 assert.notEqual(known.find(m=>m.hostTurnId==='d').id,firstOk);
 unmount(next);
 for(let pass=0;pass<6;pass++){
  // Recreated nodes, a shifted layout, and a non-contiguous mounted window.
  const remounted=[turn('a','继续梳理吧',pass*900),turn('b','ok',100+pass*900),turn('d','ok',300+pass*900)];
  known=merge(known,remounted);
  assert.equal(known.length,4,'remount must not grow ghost markers');
  assert.equal(known.find(m=>m.hostTurnId==='b').element,remounted[1].element);
  assert.equal(known.find(m=>m.hostTurnId==='d').element,remounted[2].element);
  unmount(remounted);
 }
 const final=[turn('b','ok',5000),turn('c','可以',6000),turn('d','ok',7000)];
 known=merge(known,final);
 assert.equal(known.filter(m=>m.summary==='可以').length,1);
 assert.equal(known.find(m=>m.hostTurnId==='c').element,final[1].element);
});
test('hosts without native identities retain content-based merging',()=>{
 const first=[turn(undefined,'第一条',0),turn(undefined,'第二条',100)];
 let known=merge([],first);const ids=known.map(m=>m.id);unmount(first);
 known=merge(known,[turn(undefined,'第一条',200),turn(undefined,'第二条',300)]);
 assert.equal(known.length,2);
 assert.deepEqual(known.map(m=>m.id),ids);
});
