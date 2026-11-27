import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { TimelineSettingsCard, type TimelineSettingsValues } from '../vendor/pages/popup/components/TimelineSettingsCard';
import { VisualEffectPicker, type VisualEffect } from '../vendor/pages/popup/components/VisualEffectPicker';
import { resolveVisualEffect } from '../vendor/pages/content/visualEffects/resolveEffect';
import { DarkModeToggle } from '../vendor/components/DarkModeToggle';
import { Card } from '../vendor/components/ui/card';
import { Label } from '../vendor/components/ui/label';
import { Switch } from '../vendor/components/ui/switch';
import zh from '../vendor/locales/zh/messages.json';
import type { TranslationKey } from '../vendor/utils/translations';
import { sites, siteForHost } from './sites';
import { applyPopupBrand, brandFor } from './theme';
import {
  GLOBAL_SCOPE,
  type SettingsScope,
  enabledPatch,
  readGlobalSettings,
  readSettings,
  settingsPatch,
} from './settings';

const t=(key:TranslationKey)=>zh[key]?.message ?? key;
const visible=new Set(['timelineStyle','timelineSide']);
const allSiteIds=sites.map(item=>item.siteId);

function Popup(){
  const [detectedSiteId,setDetectedSiteId]=useState<string | null>(null);
  const [selectedScope,setSelectedScope]=useState<SettingsScope | null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [dark,setDark]=useState(false);
  const [raw,setRaw]=useState<Record<string,unknown>>({});
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const menuRef=useRef<HTMLDivElement>(null);

  const scope:SettingsScope=selectedScope ?? detectedSiteId ?? GLOBAL_SCOPE;
  const isGlobal=scope===GLOBAL_SCOPE;
  const activeSite=isGlobal ? undefined : sites.find(item=>item.siteId===scope);
  const detectedSite=sites.find(item=>item.siteId===detectedSiteId);
  const values=isGlobal ? readGlobalSettings(raw,allSiteIds) : readSettings(raw,scope);
  const effect:VisualEffect=resolveVisualEffect(raw);

  useEffect(()=>{
    let alive=true;
    const detect=async()=>{
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      let active;
      try{active=siteForHost(new URL(tab?.url ?? '').hostname);}catch{}
      if(!active && tab?.id!==undefined){
        try{const reply=await chrome.tabs.sendMessage(tab.id,{type:'lite.getSite'});active=sites.find(item=>item.siteId===reply?.siteId);}catch{}
      }
      if(alive)setDetectedSiteId(active?.siteId ?? null);
    };
    Promise.all([chrome.storage.sync.get(null),detect()]).then(([data])=>{
      if(!alive)return;
      setRaw(data);
      setReady(true);
    }).catch(()=>setError('无法读取设置'));
    const changed=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
      if(area!=='sync')return;
      setRaw(previous=>{
        const next={...previous};
        for(const [key,value] of Object.entries(changes)){
          if(value.newValue===undefined) delete next[key];else next[key]=value.newValue;
        }
        return next;
      });
    };
    const onActivated=()=>{
      setSelectedScope(null);
      setMenuOpen(false);
      void detect().catch(()=>{if(alive)setDetectedSiteId(null);});
    };
    const onUpdated=()=>void detect().catch(()=>{if(alive)setDetectedSiteId(null);});
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.storage.onChanged.addListener(changed);
    return()=>{alive=false;chrome.storage.onChanged.removeListener(changed);chrome.tabs.onActivated.removeListener(onActivated);chrome.tabs.onUpdated.removeListener(onUpdated);};
  },[]);

  useEffect(()=>{
    document.documentElement.dataset.supported=detectedSite ? 'true' : 'false';
    const brandSite=activeSite ?? detectedSite ?? sites[0];
    const update=()=>{
      setDark(document.documentElement.classList.contains('dark'));
      applyPopupBrand(brandSite);
    };
    update();
    const observer=new MutationObserver(update);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    return()=>observer.disconnect();
  },[scope,detectedSiteId]);

  useEffect(()=>{
    if(!menuOpen)return;
    const onPointerDown=(event:PointerEvent)=>{
      if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setMenuOpen(false);
    };
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.removeEventListener('pointerdown',onPointerDown);
      document.removeEventListener('keydown',onKeyDown);
    };
  },[menuOpen]);

  const write=async(patch:Record<string,unknown>)=>{
    try{await chrome.storage.sync.set(patch);setError('');}
    catch{setError('保存失败，请重试');}
  };
  const change=(patch:Partial<TimelineSettingsValues>)=>{void write(settingsPatch(scope,patch,allSiteIds));};
  const chooseScope=(next:SettingsScope)=>{
    setSelectedScope(next);
    setMenuOpen(false);
  };

  return <div className="bg-background text-foreground w-full min-w-0">
    <div className="border-border/50 flex items-center justify-between border-b px-5 py-5">
      <h1 className="text-primary text-2xl font-extrabold tracking-tight">Voyager Lite</h1>
      <DarkModeToggle/>
    </div>
    <div className="flex flex-col gap-4 p-5">
      {ready && <div className="relative flex items-center justify-between" ref={menuRef}>
        <button
          id="platform"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={()=>setMenuOpen(open=>!open)}
          className="text-muted-foreground hover:bg-secondary/70 hover:text-foreground -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition-colors"
        >
          {isGlobal
            ? <Globe className="h-3.5 w-3.5 shrink-0"/>
            : <span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:brandFor(activeSite!,dark)}}/>}
          <span>{isGlobal ? '全局' : activeSite?.siteLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}/>
        </button>
        {menuOpen && <div
          role="menu"
          className="border-border/60 bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1.5 w-48 rounded-xl border p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isGlobal}
            onClick={()=>chooseScope(GLOBAL_SCOPE)}
            className={`hover:bg-accent flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${isGlobal ? 'bg-accent/70 font-semibold' : ''}`}
          >
            <span className="flex items-center gap-2">
              <Globe className="text-muted-foreground h-3.5 w-3.5 shrink-0"/>
              <span>全局</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] font-normal">全部平台</span>
              {isGlobal && <Check className="text-primary h-3.5 w-3.5 shrink-0"/>}
            </span>
          </button>
          <div className="border-border/50 my-1 border-t"/>
          {sites.map(item=>{
            const selected=scope===item.siteId;
            const current=detectedSiteId===item.siteId;
            return <button
              key={item.siteId}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={()=>chooseScope(item.siteId)}
              className={`hover:bg-accent flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${selected ? 'bg-accent/70 font-semibold' : ''}`}
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:brandFor(item,dark)}}/>
                <span>{item.siteLabel}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {current && <span className="text-muted-foreground text-[11px] font-normal">当前</span>}
                {selected && <Check className="text-primary h-3.5 w-3.5 shrink-0"/>}
              </span>
            </button>;
          })}
        </div>}
      </div>}
      {ready && <>
        <Card className="p-4"><div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label htmlFor="timeline-enabled">时间线</Label>
            {values.enabledMixed && <span className="text-muted-foreground text-xs">部分开启</span>}
          </div>
          <Switch id="timeline-enabled" checked={values.enabled} onChange={event=>void write(enabledPatch(scope,event.target.checked,allSiteIds))}/>
        </div></Card>
        {(values.enabled || values.enabledMixed) && <TimelineSettingsCard values={values} styleMixed={values.styleMixed} sideMixed={values.sideMixed} onChange={change}
          onResetPosition={()=>{}}
          onViewStarredHistory={()=>{}} isVisible={id=>visible.has(id)} t={t}/>}
        <VisualEffectPicker value={effect} onChange={value=>void write({gvVisualEffect:value})} t={t}/>
      </>}
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    </div>
  </div>;
}
createRoot(document.getElementById('__root')!).render(<Popup/>);
