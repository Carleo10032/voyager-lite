import { createStarStore } from '../vendor/features/savedLibrary/starStore';
import { parseCatalogOutlineWriteRequest } from '../vendor/features/timeline/catalogOutlineMessages';
import { writeCatalogOutlineEdit } from '../vendor/features/timeline/catalogOutlineWriter';
import { siteForHost } from './sites';
const store = createStarStore(chrome.storage.local);
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || !sender.tab || (sender.frameId ?? 0)!==0) return;
  let site; try {site=siteForHost(new URL(sender.url || sender.tab.url || '').hostname);} catch {return;}
  if(!site) return;
  const {type,payload} = message ?? {};
  if(typeof type!=='string' || (!type.startsWith('gv.starred.') && type!=='gv.timeline.catalogOutline.write')) return;
  const run = async()=>{
    const own = (id: unknown)=>typeof id==='string' && id.startsWith(`${site!.siteId}:`);
    if(type==='gv.starred.getAll') {
      const data=await store.getAll();
      return {ok:true,data:{messages:Object.fromEntries(Object.entries(data.messages).filter(([id])=>own(id)))}};
    }
    if(type==='gv.timeline.catalogOutline.write') {
      const request=parseCatalogOutlineWriteRequest(payload);
      if(!request || request.kind!=='edit' || !own(request.conversationId) || request.key!==`gvCatalogTimelineHierarchy:${site!.siteId}`) throw Error('Invalid outline');
      return {ok:await writeCatalogOutlineEdit(request.key,request.conversationId,request.edit)};
    }
    if(!payload || !own(payload.conversationId)) throw Error('Invalid conversation');
    switch(type){
      case 'gv.starred.add': return {ok:true,added:await store.add(payload)};
      case 'gv.starred.remove': return {ok:true,removed:await store.remove(payload.conversationId,payload.turnId)};
      case 'gv.starred.backfillTexts': await store.backfill(payload.conversationId,payload.entries); return {ok:true};
      case 'gv.starred.getForConversation': return {ok:true,messages:await store.getForConversation(payload.conversationId)};
      default: throw Error('Unsupported operation');
    }
  };
  // Serialize read-modify-write operations across tabs, including outline edits.
  queue=queue.then(run).then(reply,error=>reply({ok:false,error:String(error)}));
  return true;
});
