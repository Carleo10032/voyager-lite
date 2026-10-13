import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TimelineSettingsCard, type TimelineSettingsValues } from '../vendor/pages/popup/components/TimelineSettingsCard';
import { VisualEffectPicker, type VisualEffect } from '../vendor/pages/popup/components/VisualEffectPicker';
import { KeyboardShortcutSettings } from '../vendor/pages/popup/components/KeyboardShortcutSettings';
import { DarkModeToggle } from '../vendor/components/DarkModeToggle';
import { Card } from '../vendor/components/ui/card';
import { Label } from '../vendor/components/ui/label';
import { Switch } from '../vendor/components/ui/switch';
import zh from '../vendor/locales/zh/messages.json';
import type { TranslationKey } from '../vendor/utils/translations';
import { sites, siteForHost } from './sites';
import { applyPopupBrand } from './theme';
import { readSettings, settingsPatch, enabledKey } from './settings';

const t=(key:TranslationKey)=>zh[key]?.message ?? key;
const visible=new Set(['timelineStyle','scrollMode','hideOuterContainer','pinTimelinePreview']);

function Popup(){
  const [siteId,setSiteId]=useState<string | null>(null);
  const [raw,setRaw]=useState<Record<string,unknown>>({});
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const site=sites.find(item=>item.siteId===siteId);
  const values=readSettings(raw,siteId ?? '');
  const effect:VisualEffect=raw.gvVisualEffect==='snow'||raw.gvVisualEffect==='sakura'||raw.gvVisualEffect==='rain'?raw.gvVisualEffect:'off';
  useEffect(()=>{
    let alive=true;
    const detect=async()=>{
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      let active;
      try{active=siteForHost(new URL(tab?.url ?? '').hostname);}catch{}
      if(!active && tab?.id!==undefined){
        try{const reply=await chrome.tabs.sendMessage(tab.id,{type:'lite.getSite'});active=sites.find(item=>item.siteId===reply?.siteId);}catch{}
      }
      if(alive)setSiteId(active?.siteId ?? null);
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
    const redetect=()=>void detect().catch(()=>{if(alive)setSiteId(null);});
    chrome.tabs.onActivated.addListener(redetect);
    chrome.tabs.onUpdated.addListener(redetect);
    chrome.storage.onChanged.addListener(changed);
    return()=>{alive=false;chrome.storage.onChanged.removeListener(changed);chrome.tabs.onActivated.removeListener(redetect);chrome.tabs.onUpdated.removeListener(redetect);};
  },[]);
  useEffect(()=>{
    document.documentElement.dataset.supported=site ? 'true' : 'false';
    const brandSite=site ?? sites.find(item=>item.siteId==='chatgpt')!;
    const update=()=>applyPopupBrand(brandSite);
    update();
    const observer=new MutationObserver(update);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    return()=>observer.disconnect();
  },[siteId]);
  const write=async(patch:Record<string,unknown>)=>{
    try{await chrome.storage.sync.set(patch);setError('');}
    catch{setError('保存失败，请重试');}
  };
  const change=(patch:Partial<TimelineSettingsValues>)=>{if(siteId)void write(settingsPatch(siteId,patch));};
  return <div className="bg-background text-foreground w-full min-w-0">
    <div className="border-border/50 flex items-center justify-between border-b px-5 py-5">
      <h1 className="text-primary text-2xl font-extrabold tracking-tight">Voyager Lite</h1>
      <DarkModeToggle/>
    </div>
    <div className="flex flex-col gap-4 p-5">
      {ready && <div className="text-muted-foreground text-sm" id="platform">{site?.siteLabel ?? '当前页面不支持'}</div>}
      {ready && <>
        {siteId && <><Card className="p-4"><div className="flex items-center justify-between">
          <Label htmlFor="timeline-enabled">时间线</Label>
          <Switch id="timeline-enabled" checked={values.enabled} onChange={event=>void write({[enabledKey(siteId)]:event.target.checked})}/>
        </div></Card>
        {values.enabled && <TimelineSettingsCard values={values} onChange={change}
          onResetPosition={()=>{}}
          onViewStarredHistory={()=>{}} isVisible={id=>visible.has(id)} t={t}/>}</>}
        {siteId && values.enabled && <KeyboardShortcutSettings t={t}/>}
        {siteId && <VisualEffectPicker value={effect} onChange={value=>void write({gvVisualEffect:value,gvSnowEffect:false})} t={t}/>}
      </>}
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    </div>
  </div>;
}
createRoot(document.getElementById('__root')!).render(<Popup/>);
