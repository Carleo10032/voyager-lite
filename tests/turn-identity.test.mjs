import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';
const bundled=await build({entryPoints:['vendor/features/timeline/adapters/catalog/turnMerge.ts'],bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':path.resolve('vendor')}});
const scope={module:{exports:{}}};
vm.runInNewContext(bundled.outputFiles[0].text,scope);
const {mergeMountedTurns,rememberedMarkers}=scope.module.exports;
const hostBundled=await build({entryPoints:['vendor/features/timeline/adapters/catalog/hostTurnId.ts'],bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':path.resolve('vendor')}});
const hostScope={module:{exports:{}}};
vm.runInNewContext(hostBundled.outputFiles[0].text,hostScope);
const {hostTurnId}=hostScope.module.exports;
const adapterBundled=await build({entryPoints:['vendor/features/timeline/adapters/catalog/CatalogTimelineAdapter.ts'],bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':path.resolve('vendor')}});
function turn(hostTurnId,summary,center,{pending=false}={}){
 const attrs=new Map();
 return {hostTurnId,pending,summary,element:{isConnected:true,center,getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v)}};
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
test('an image-only turn remains one marker across repeated refreshes',()=>{
 const mounted=[turn('image','【附件】',0),turn('question','后续问题',100)];
 mounted[0].attachmentPlaceholder=true;
 let known=merge([],mounted);
 const id=known[0].id,hash=known[0].hash;
 for(let pass=0;pass<100;pass++) known=merge(known,mounted);
 assert.equal(known.length,2);
 assert.equal(known[0].summary,'【附件】');
 assert.equal(known[0].attachmentPlaceholder,true);
 assert.equal(known[0].id,id);
 assert.equal(known[0].hash,hash);
});

test('Gemini pending-request adopts committed hostTurnId without leaving ghost duplicates',()=>{
 const existing=[turn('3c3241f849165b5d','第一条',100),turn('77251ef9a6272401','第二条',400)];
 let known=merge([],existing);
 const pending=turn(undefined,'怎么理解这个a和f',900,{pending:true});
 known=merge(known,[...existing,pending]);
 assert.equal(known.length,3);
 const pendingId=known[2].id;
 assert.equal(known[2].pending,true);

 // Angular tears down <pending-request> and inserts <div id="0833f2e5af479d03">.
 pending.element.isConnected=false;
 const committed=turn('0833f2e5af479d03','怎么理解这个a和f',900);
 known=merge(known,[...existing,committed]);
 assert.equal(known.length,3,'committed turn must adopt pending marker instead of duplicating');
 assert.equal(known[2].id,pendingId);
 assert.equal(known[2].hostTurnId,'0833f2e5af479d03');
 assert.equal(known[2].element,committed.element);
 assert.equal(known[2].pending,false);

 // Sending another identical prompt while the previous one is committed (or unmounted) keeps two distinct markers.
 unmount(existing);
 committed.element.isConnected=false;
 const pendingRepeat=turn(undefined,'怎么理解这个a和f',1500,{pending:true});
 known=merge(known,[pendingRepeat]);
 assert.equal(known.length,4,'pending repeat must not steal an already-identified turn');
 assert.equal(known[2].hostTurnId,'0833f2e5af479d03');
 assert.equal(known[3].hostTurnId,undefined);
 assert.equal(known[3].pending,true);

 pendingRepeat.element.isConnected=false;
 const committedRepeat=turn('3cf01307a66d21c6','怎么理解这个a和f',1500);
 known=merge(known,[committedRepeat]);
 assert.equal(known.length,4,'committed repeat adopts its own pending marker');
 assert.equal(known[2].hostTurnId,'0833f2e5af479d03');
 assert.equal(known[3].hostTurnId,'3cf01307a66d21c6');
 assert.equal(known[3].element,committedRepeat.element);
 assert.equal(known[3].pending,false);
});

test('detached pending turn that is cancelled or changes summary is dropped cleanly',()=>{
 const first=turn('row-1','历史问题',100);
 let known=merge([],[first]);
 const cancelled=turn(undefined,'发送失败的问题',500,{pending:true});
 known=merge(known,[first,cancelled]);
 assert.equal(known.length,2);
 cancelled.element.isConnected=false;
 known=merge(known,[first]);
 assert.equal(known.length,1,'cancelled pending turn must not remain as a ghost');

 const changed=turn(undefined,'【附件】',600,{pending:true});
 known=merge(known,[first,changed]);
 assert.equal(known.length,2);
 changed.element.isConnected=false;
 const committed=turn('row-2','课件.pptx',600);
 known=merge(known,[first,committed]);
 assert.equal(known.length,2,'unmatched detached pending turn is replaced cleanly');
 assert.equal(known[1].hostTurnId,'row-2');
 assert.equal(known[1].summary,'课件.pptx');

 // Cancelling the only pending turn in an empty thread clears the list.
 const solo=turn(undefined,'首条发送中',100,{pending:true});
 let soloKnown=merge([],[solo]);
 solo.element.isConnected=false;
 soloKnown=merge(soloKnown,[]);
 assert.equal(soloKnown.length,0);
});

test('in-place hostTurnId assignment on the same DOM element upgrades without duplicating',()=>{
 const optimistic=turn(undefined,'刚发出的消息',300);
 let known=merge([],[optimistic]);
 const id=known[0].id;
 const upgraded={...optimistic,hostTurnId:'server-msg-42'};
 known=merge(known,[upgraded]);
 assert.equal(known.length,1);
 assert.equal(known[0].id,id);
 assert.equal(known[0].hostTurnId,'server-msg-42');
 assert.equal(known[0].element,optimistic.element);
});

test('Gemini hostTurnId ignores pending-request wrappers and reads committed row ids',()=>{
 const scroller={matches:sel=>sel==='infinite-scroller[data-test-id="chat-history-container"]'};
 const committedRow={id:'0833f2e5af479d03',parentElement:scroller};
 const committedBubble={
  closest(sel){
   if(sel==='pending-request') return null;
   if(sel==='user-query') return {parentElement:committedRow};
   return null;
  },
 };
 assert.equal(hostTurnId('gemini',committedBubble),'0833f2e5af479d03');

 const pendingRow={id:'temp-pending',parentElement:scroller};
 const pendingBubble={
  closest(sel){
   if(sel==='pending-request') return pendingRow;
   if(sel==='user-query') return {parentElement:pendingRow};
   return null;
  },
 };
 assert.equal(hostTurnId('gemini',pendingBubble),undefined);
});

test('CatalogTimelineAdapter seamlessly transitions Gemini pending-request into committed turn with reply preview',()=>{
 const Node={ELEMENT_NODE:1,TEXT_NODE:3,DOCUMENT_POSITION_FOLLOWING:4};
 class MiniEl{
  constructor(tag,text=''){
   this.nodeType=1;this.tagName=tag.toUpperCase();this.textContent=text;
   this.attrs=new Map();this.children=[];this.parentElement=null;this.style={};this.classList=[];
   this.top=0;this.height=64;this.scrollTop=0;this.scrollHeight=2000;this.clientHeight=800;
  }
  get id(){return this.attrs.get('id')??'';}
  set id(v){this.attrs.set('id',v);}
  get childNodes(){return this.children.length?this.children:(this.textContent?[{nodeType:3,nodeValue:this.textContent}]:[]);}
  get isConnected(){for(let c=this;c;c=c.parentElement)if(c===doc.body)return true;return false;}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='class')this.classList=String(v).split(/\s+/).filter(Boolean);}
  getAttribute(k){return this.attrs.get(k)??null;}
  hasAttribute(k){return this.attrs.has(k);}
  removeAttribute(k){this.attrs.delete(k);}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;}
  matches(sel){
   return sel.split(',').map(s=>s.trim()).some(part=>{
    if(part==='user-query .user-query-bubble-with-background') return this.classList.includes('user-query-bubble-with-background')&&!!this.closest('user-query');
    if(part==='infinite-scroller[data-test-id="chat-history-container"]') return this.tagName==='INFINITE-SCROLLER'&&this.getAttribute('data-test-id')==='chat-history-container';
    if(part==='model-response') return this.tagName==='MODEL-RESPONSE';
    if(part==='pending-request') return this.tagName==='PENDING-REQUEST';
    if(part==='user-query') return this.tagName==='USER-QUERY';
    return false;
   });
  }
  closest(sel){for(let c=this;c;c=c.parentElement)if(c.matches(sel))return c;return null;}
  querySelectorAll(sel){
   const out=[];
   const walk=n=>{for(const c of n.children){if(c.matches(sel))out.push(c);walk(c);}};
   walk(this);return out;
  }
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  getBoundingClientRect(){return {top:this.top,bottom:this.top+this.height,height:this.height,width:400};}
  compareDocumentPosition(other){
   const flat=[];const walk=n=>{flat.push(n);for(const c of n.children)walk(c);};walk(doc.body);
   return flat.indexOf(this)<flat.indexOf(other)?Node.DOCUMENT_POSITION_FOLLOWING:0;
  }
 }
 const body=new MiniEl('body');
 const doc={documentElement:body,body,scrollingElement:body,querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};
 const adapterScope={
  module:{exports:{}},
  location:{href:'https://gemini.google.com/u/1/app/d34d9c68a67adff1',pathname:'/u/1/app/d34d9c68a67adff1',origin:'https://gemini.google.com'},
  window:{scrollY:0,addEventListener(){},removeEventListener(){}},
  document:doc,Node,Element:MiniEl,HTMLElement:MiniEl,HTMLFormElement:class{},MutationObserver:class{observe(){}},
  getComputedStyle:el=>({display:'block',flexDirection:'column',overflowY:el.style.overflowY||'visible'}),
 };
 vm.runInNewContext(adapterBundled.outputFiles[0].text,adapterScope);
 const {CatalogTimelineAdapter}=adapterScope.module.exports;

 const scroller=new MiniEl('infinite-scroller');
 scroller.setAttribute('data-test-id','chat-history-container');
 scroller.style.overflowY='auto';
 body.appendChild(scroller);

 function makeTurn(tag,id,promptText,replyText,top){
  const row=new MiniEl(tag);if(id)row.id=id;
  const uq=new MiniEl('user-query');
  const bubble=new MiniEl('span',promptText);
  bubble.setAttribute('class','user-query-bubble-with-background');
  bubble.top=top;
  uq.appendChild(bubble);row.appendChild(uq);
  if(replyText){const mr=new MiniEl('model-response',replyText);row.appendChild(mr);}
  return {row,bubble};
 }

 const t1=makeTurn('div','77251ef9a6272401','不太理解','回复一',100);
 scroller.appendChild(t1.row);
 const adapter=new CatalogTimelineAdapter({
  siteId:'gemini',siteLabel:'Gemini',position:'right',pluginId:'lite.gemini',coachmarkId:'lite-timeline',
  turnSelector:'user-query .user-query-bubble-with-background',assistantTurnSelector:'model-response',
 }, {observe(){},canStar:()=>true});

 let snap=adapter.turns.read([]);
 assert.equal(snap.markers.length,1);

 // User sends a new message: Gemini inserts <pending-request> with no id and no model-response yet.
 const pending=makeTurn('pending-request','','怎么理解这个a和f','',600);
 scroller.appendChild(pending.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2);
 const pendingMarkerId=snap.markers[1].id;
 assert.equal(snap.markers[1].hostTurnId,undefined);
 assert.equal(snap.markers[1].assistantSummary,'');

 // Gemini replaces <pending-request> with committed <div id="0833f2e5af479d03"> and <model-response>.
 scroller.removeChild(pending.row);
 const committed=makeTurn('div','0833f2e5af479d03','怎么理解这个a和f','al 和 fl 的核心区别只差一个简并度',600);
 scroller.appendChild(committed.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2,'must not leave a ghost pending dot before the committed turn');
 assert.equal(snap.markers[1].id,pendingMarkerId);
 assert.equal(snap.markers[1].hostTurnId,'0833f2e5af479d03');
 assert.equal(snap.markers[1].element,committed.bubble);
 assert.equal(snap.markers[1].assistantSummary,'al 和 fl 的核心区别只差一个简并度');
});

test('Gemini repeated edits replace the edited branch without duplicate or dead trailing dots',()=>{
 const Node={ELEMENT_NODE:1,TEXT_NODE:3,DOCUMENT_POSITION_FOLLOWING:4};
 class MiniEl{
  constructor(tag,text=''){
   this.nodeType=1;this.tagName=tag.toUpperCase();this.textContent=text;
   this.attrs=new Map();this.children=[];this.parentElement=null;this.style={};this.classList=[];
   this.top=0;this.height=64;this.scrollTop=0;this.scrollHeight=2000;this.clientHeight=800;
  }
  get id(){return this.attrs.get('id')??'';}
  set id(v){this.attrs.set('id',v);}
  get childNodes(){return this.children.length?this.children:(this.textContent?[{nodeType:3,nodeValue:this.textContent}]:[]);}
  get isConnected(){for(let c=this;c;c=c.parentElement)if(c===doc.body)return true;return false;}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='class')this.classList=String(v).split(/\s+/).filter(Boolean);}
  getAttribute(k){return this.attrs.get(k)??null;}
  hasAttribute(k){return this.attrs.has(k);}
  removeAttribute(k){this.attrs.delete(k);}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;}
  matches(sel){
   return sel.split(',').map(s=>s.trim()).some(part=>{
    if(part==='user-query .user-query-bubble-with-background') return this.classList.includes('user-query-bubble-with-background')&&!!this.closest('user-query');
    if(part==='user-query:not(:has(.user-query-bubble-with-background))') return this.tagName==='USER-QUERY'&&!this.querySelector('user-query .user-query-bubble-with-background');
    if(part==='infinite-scroller[data-test-id="chat-history-container"]') return this.tagName==='INFINITE-SCROLLER'&&this.getAttribute('data-test-id')==='chat-history-container';
    if(part==='model-response') return this.tagName==='MODEL-RESPONSE';
    if(part==='pending-request') return this.tagName==='PENDING-REQUEST';
    if(part==='user-query') return this.tagName==='USER-QUERY';
    return false;
   });
  }
  closest(sel){for(let c=this;c;c=c.parentElement)if(c.matches(sel))return c;return null;}
  querySelectorAll(sel){
   const out=[];
   const walk=n=>{for(const c of n.children){if(c.matches(sel))out.push(c);walk(c);}};
   walk(this);return out;
  }
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  getBoundingClientRect(){return {top:this.top,bottom:this.top+this.height,height:this.height,width:400};}
  compareDocumentPosition(other){
   const flat=[];const walk=n=>{flat.push(n);for(const c of n.children)walk(c);};walk(doc.body);
   return flat.indexOf(this)<flat.indexOf(other)?Node.DOCUMENT_POSITION_FOLLOWING:0;
  }
 }
 const body=new MiniEl('body');
 const doc={documentElement:body,body,scrollingElement:body,querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};
 const adapterScope={
  module:{exports:{}},
  location:{href:'https://gemini.google.com/u/1/app/09b2a71fb2bf4e33',pathname:'/u/1/app/09b2a71fb2bf4e33',origin:'https://gemini.google.com'},
  window:{scrollY:0,addEventListener(){},removeEventListener(){}},
  document:doc,Node,Element:MiniEl,HTMLElement:MiniEl,HTMLFormElement:class{},MutationObserver:class{observe(){}},
  getComputedStyle:el=>({display:'block',flexDirection:'column',overflowY:el.style.overflowY||'visible'}),
 };
 vm.runInNewContext(adapterBundled.outputFiles[0].text,adapterScope);
 const {CatalogTimelineAdapter}=adapterScope.module.exports;

 const scroller=new MiniEl('infinite-scroller');
 scroller.setAttribute('data-test-id','chat-history-container');
 scroller.style.overflowY='auto';
 body.appendChild(scroller);

 function makeTurn(tag,id,promptText,replyText,top){
  const row=new MiniEl(tag);if(id)row.id=id;
  const uq=new MiniEl('user-query');
  const bubble=new MiniEl('span',promptText);
  bubble.setAttribute('class','user-query-bubble-with-background');
  bubble.top=top;
  uq.top=top;
  uq.appendChild(bubble);row.appendChild(uq);
  if(replyText){const mr=new MiniEl('model-response',replyText);row.appendChild(mr);}
  return {row,uq,bubble};
 }

 const t0=makeTurn('div','row-0','第一题','答一',100);
 const t1=makeTurn('div','row-1','这个琼斯矩阵是用J还是M','旧回复',500);
 scroller.appendChild(t0.row);
 scroller.appendChild(t1.row);
 const adapter=new CatalogTimelineAdapter({
  siteId:'gemini',siteLabel:'Gemini',position:'right',pluginId:'lite.gemini',coachmarkId:'lite-timeline',
  turnSelector:'user-query .user-query-bubble-with-background, user-query:not(:has(.user-query-bubble-with-background))',
  assistantTurnSelector:'model-response',
 }, {observe(){},canStar:()=>true});

 let snap=adapter.turns.read([]);
 assert.equal(snap.markers.length,2);
 const originalT1Id=snap.markers[1].id;

 // Entering edit mode detaches the bubble span while keeping the same row id; cancelling preserves the marker id.
 t1.uq.removeChild(t1.bubble);
 const draft=new MiniEl('div','这个琼斯矩阵是用J还是M？');
 t1.uq.appendChild(draft);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2);
 assert.equal(snap.markers[1].id,originalT1Id);
 assert.equal(snap.markers[1].hostTurnId,'row-1');
 t1.uq.removeChild(draft);
 t1.uq.appendChild(t1.bubble);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2);
 assert.equal(snap.markers[1].id,originalT1Id);
 assert.equal(snap.markers[1].summary,'这个琼斯矩阵是用J还是M');

 // Submitting an edit (even without clicking .update-button, e.g. via Enter) removes row-1 and inserts pending -> row-2.
 scroller.removeChild(t1.row);
 const pendingEdit=makeTurn('pending-request','','这个琼斯矩阵是用J还是M？','',480);
 scroller.appendChild(pendingEdit.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2,'old edited turn must be dropped immediately');
 assert.equal(snap.markers[1].summary,'这个琼斯矩阵是用J还是M？');

 scroller.removeChild(pendingEdit.row);
 const committedEdit=makeTurn('div','row-2','这个琼斯矩阵是用J还是M？','新回复',480);
 scroller.appendChild(committedEdit.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2,'committed edit must not leave duplicate or dead trailing dot');
 assert.equal(snap.markers[1].hostTurnId,'row-2');
 assert.equal(snap.markers[1].element,committedEdit.bubble);
 assert.equal(snap.markers[1].element.isConnected,true);

 // Re-editing the same turn a second time also keeps exactly 2 live markers.
 scroller.removeChild(committedEdit.row);
 const reEdited=makeTurn('div','row-3','这个琼斯矩阵是用J还是M？','再次回复',470);
 scroller.appendChild(reEdited.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2);
 assert.equal(snap.markers[1].hostTurnId,'row-3');
 assert.equal(snap.markers[1].element,reEdited.bubble);
 assert.equal(snap.markers[1].element.isConnected,true);

 // Editing an earlier turn discards downstream turns cleanly.
 const t2=makeTurn('div','row-4','追问','追答',900);
 scroller.appendChild(t2.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,3);
 scroller.removeChild(reEdited.row);
 scroller.removeChild(t2.row);
 const branchRow=makeTurn('div','row-5','改写中间轮次','新分支回复',460);
 scroller.appendChild(branchRow.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,2);
 assert.deepEqual(Array.from(snap.markers,m=>m.hostTurnId),['row-0','row-5']);

 // Deleting the conversation removes all turns from Gemini's DOM: markers clear immediately in place.
 scroller.removeChild(t0.row);
 scroller.removeChild(branchRow.row);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,0,'deleting a Gemini conversation must clear detached markers immediately');
});

test('rememberedMarkers pruneDisconnected drops stale committed turns while keeping active virtualized ids and pending turns',()=>{
 const a=turn('turn-a','第一条',0);
 const b=turn('turn-b','旧分支',200);
 const p=turn(undefined,'发送中',400,{pending:true});
 const known=merge([],[a,b,p]);
 // turn-a is virtualized out in DOM, but still present via an authoritative anchor with the same hostTurnId.
 a.element.isConnected=false;
 b.element.isConnected=false;
 p.element.isConnected=false;
 const aAnchor=turn('turn-a','第一条',0);
 const bNew=turn('turn-b-v2','新分支',200);
 const kept=rememberedMarkers(known,[aAnchor,bNew],{pruneDisconnected:true});
 assert.deepEqual(Array.from(kept,m=>m.hostTurnId),['turn-a',undefined]);
});

test('Grok prunes disconnected visible/past-end replaced turns (e.g. after Stop) while keeping off-screen virtualized turns and open editors',()=>{
 const Node={ELEMENT_NODE:1,TEXT_NODE:3,DOCUMENT_POSITION_FOLLOWING:4};
 class MiniEl{
  constructor(tag,text=''){
   this.nodeType=1;this.tagName=tag.toUpperCase();this.textContent=text;
   this.attrs=new Map();this.children=[];this.parentElement=null;this.style={};this.classList=[];
   this.top=0;this.height=48;this.scrollTop=0;this.scrollHeight=1000;this.clientHeight=600;
  }
  get id(){return this.attrs.get('id')??'';}
  set id(v){this.attrs.set('id',v);}
  get childNodes(){return this.children.length?this.children:(this.textContent?[{nodeType:3,nodeValue:this.textContent}]:[]);}
  get isConnected(){for(let c=this;c;c=c.parentElement)if(c===doc.body)return true;return false;}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='class')this.classList=String(v).split(/\s+/).filter(Boolean);}
  getAttribute(k){return this.attrs.get(k)??null;}
  hasAttribute(k){return this.attrs.has(k);}
  removeAttribute(k){this.attrs.delete(k);}
  appendChild(c){c.parentElement=this;this.children.push(c);return c;}
  removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentElement=null;}
  matches(sel){
   return sel.split(',').map(s=>s.trim()).some(part=>{
    if(part==='[data-testid="user-message"]') return this.getAttribute('data-testid')==='user-message';
    if(part==='[data-testid="chat-transcript-scroller"]') return this.getAttribute('data-testid')==='chat-transcript-scroller';
    if(part==='[id^="response-"]') return this.id.startsWith('response-');
    return false;
   });
  }
  closest(sel){for(let c=this;c;c=c.parentElement)if(c.matches(sel))return c;return null;}
  querySelectorAll(sel){
   const out=[];
   const walk=n=>{for(const c of n.children){if(c.matches(sel))out.push(c);walk(c);}};
   walk(this);return out;
  }
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  getBoundingClientRect(){return {top:this.top,bottom:this.top+this.height,height:this.height,width:400};}
 }
 const body=new MiniEl('body');
 const findById=(node,id)=>{if(node.id===id)return node;for(const c of node.children){const f=findById(c,id);if(f)return f;}return null;};
 const doc={documentElement:body,body,scrollingElement:body,querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s),getElementById:id=>findById(body,id)};
 const loc={href:'https://grok.com/c/test-conv?rid=r1',pathname:'/c/test-conv',origin:'https://grok.com'};
 const adapterScope={
  module:{exports:{}},location:loc,
  window:{scrollY:0,innerHeight:600,addEventListener(){},removeEventListener(){}},
  document:doc,Node,Element:MiniEl,HTMLElement:MiniEl,HTMLFormElement:class{},MutationObserver:class{observe(){}},
  getComputedStyle:el=>({display:'block',flexDirection:'column',overflowY:el.style.overflowY||'visible'}),
 };
 vm.runInNewContext(adapterBundled.outputFiles[0].text,adapterScope);
 const {CatalogTimelineAdapter}=adapterScope.module.exports;

 const scroller=new MiniEl('div');
 scroller.setAttribute('data-testid','chat-transcript-scroller');
 scroller.style.overflowY='scroll';
 scroller.scrollTop=0;scroller.clientHeight=600;scroller.scrollHeight=1000;
 body.appendChild(scroller);

 function makeGrokTurn(id,text,top){
  const resp=new MiniEl('div');resp.id=id;
  const msg=new MiniEl('div',text);msg.setAttribute('data-testid','user-message');msg.top=top;
  resp.appendChild(msg);
  return {resp,msg};
 }

 const t0=makeGrokTurn('response-0','早期轮次',100);
 const t1=makeGrokTurn('response-1','当前可见轮次',300);
 scroller.appendChild(t0.resp);
 scroller.appendChild(t1.resp);

 const adapter=new CatalogTimelineAdapter({
  siteId:'grok',siteLabel:'Grok',position:'left',pluginId:'lite.grok',coachmarkId:'lite-timeline',
  scrollContainerSelector:'[data-testid="chat-transcript-scroller"]',
  turnSelector:'[data-testid="user-message"]',
 }, {observe(){},canStar:()=>true});

 let snap=adapter.turns.read([]);
 assert.equal(snap.markers.length,2);

 // Scroll down so response-0 is virtualized off-screen above viewport (scrollTop=400, viewport=[400..1000]), and add optimistic turn at 800.
 scroller.scrollTop=400;scroller.scrollHeight=1200;
 scroller.removeChild(t0.resp);
 t1.msg.top=100; // 400 + 100 = 500 (visible)
 const tempTurn=makeGrokTurn('response-temp','你好？',400); // 400 + 400 = 800 (visible)
 scroller.appendChild(tempTurn.resp);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,3,'off-screen virtualized response-0 is preserved');

 // User clicks Stop: Grok replaces response-temp with response-final at the same visible offset WITHOUT changing ?rid=.
 scroller.removeChild(tempTurn.resp);
 const finalTurn=makeGrokTurn('response-final','你好？',400);
 scroller.appendChild(finalTurn.resp);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,3,'replaced visible response-temp must be pruned without duplicate');
 assert.deepEqual(Array.from(snap.markers,m=>m.hostTurnId),['response-0','response-1','response-final']);

 // Opening inline edit on response-final removes [data-testid="user-message"] while keeping div#response-final in DOM: marker stays intact.
 finalTurn.resp.removeChild(finalTurn.msg);
 snap=adapter.turns.read(snap.markers);
 assert.equal(snap.markers.length,3,'open editor whose response container stays connected must keep its marker');
 assert.deepEqual(Array.from(snap.markers,m=>m.hostTurnId),['response-0','response-1','response-final']);
});
