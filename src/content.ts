import { startTheme } from './theme';
import { TimelineEngine } from '../vendor/features/timeline/TimelineEngine';
import { CatalogTimelineAdapter } from '../vendor/features/timeline/adapters/catalog/CatalogTimelineAdapter';
import { CatalogTurnOwnership } from '../vendor/features/timeline/adapters/catalog/CatalogTurnOwnership';
import { starConversationId } from '../vendor/features/timeline/adapters/catalog/conversationId';
import { runRouteTimeline } from '../vendor/features/timeline/runRouteTimeline';
import { startVisualEffects } from '../vendor/pages/content/visualEffects';
import { siteForHost, configFor } from './sites';
import { readSettings } from './settings';

async function main() {
  const scope=globalThis as typeof globalThis & { __voyagerLiteStarted?: boolean };
  // Re-injection must never start a second timeline in the same isolated world.
  if (scope.__voyagerLiteStarted) return;
  scope.__voyagerLiteStarted=true;
  const site = siteForHost(location.hostname);
  if (!site) return;
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='lite.getSite')reply({siteId:site.siteId});
  });
  const config = configFor(site);
  const ownership = new CatalogTurnOwnership({routeId:()=>location.href.split('#')[0], starId:()=>starConversationId(config)});
  ownership.begin();
  const observer = new MutationObserver(records => ownership.recordInsertions(records));
  observer.observe(document.body, {childList:true,subtree:true});
  startTheme(site);
  startVisualEffects();
  let timeline: ReturnType<typeof runRouteTimeline> | undefined;
  let controller: AbortController | undefined;
  const stored = await chrome.storage.sync.get(null);
  const apply = () => {
    const settings=readSettings(stored,site.siteId);
    if (!settings.enabled) { controller?.abort(); timeline=undefined; return; }
    const pluginSettings={timelineStyle:settings.timelineStyle,draggable:false,markerLevel:false};
    if (!timeline) {
      controller = new AbortController();
      timeline = runRouteTimeline({signal:controller.signal, followHash:true, createEngine:()=>{
        const current=readSettings(stored,site.siteId);
        const engine = new TimelineEngine(new CatalogTimelineAdapter(config,ownership),controller!.signal);
        engine.updateSettings({timelineStyle:current.timelineStyle,draggable:false,markerLevel:false});
        return engine;
      }});
    } else timeline.engine?.updateSettings(pluginSettings);
  };
  apply();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='sync') return;
    for(const [key,change] of Object.entries(changes)) {
      if(change.newValue===undefined) delete stored[key];
      else stored[key]=change.newValue;
    }
    apply();
  });
}
main().catch(error=>console.error('[Voyager Lite]',error));
