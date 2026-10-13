import type { sites } from './sites';
export type Site = typeof sites[number];

export function brandFor(site: Site, dark: boolean) {
  return dark ? site.darkBrandColor : site.brandColor;
}

export function softBrandFor(site: Site, dark: boolean) {
  if(dark) return `color-mix(in srgb, ${site.darkBrandColor} 18%, #202127)`;
  if(site.siteId==='chatgpt') return '#eaf3fd';
  return `color-mix(in srgb, ${site.brandColor} 12%, white)`;
}

// Keep upstream timeline tokens and popup controls on the same site accent.
export function applyPopupBrand(site: Site) {
  const dark = document.documentElement.classList.contains('dark');
  const brand = brandFor(site, dark);
  const foreground = dark ? '#151515' : '#ffffff';
  for (const [key,value] of Object.entries({
    '--primary':brand, '--color-primary':brand, '--ring':brand, '--color-ring':brand,
    '--primary-foreground':foreground, '--color-primary-foreground':foreground,
    '--accent':softBrandFor(site,dark),
    '--color-accent':softBrandFor(site,dark),
  })) document.documentElement.style.setProperty(key,value);
}

export function startTheme(site: Site) {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    let scheme: string | undefined;
    for (const node of [document.documentElement,document.body]) {
      const declared = node.getAttribute('data-theme');
      if (declared === 'dark' || declared === 'light') { scheme=declared; break; }
      if (node.classList.contains('dark') || node.classList.contains('dark-theme')) { scheme='dark'; break; }
      if (node.classList.contains('light') || node.classList.contains('light-theme')) { scheme='light'; break; }
    }
    scheme ??= media.matches ? 'dark' : 'light';
    const html=document.documentElement;
    html.dataset.gvScheme=scheme;
    html.dataset.gvPlatform=site.siteId;
    html.style.setProperty('--gv-pm-brand',brandFor(site,scheme==='dark'));
    html.style.setProperty('--gv-pm-brand-fg',scheme==='dark'?'#151515':'#ffffff');
    html.style.setProperty('--lite-brand-soft',softBrandFor(site,scheme==='dark')); 
  };
  const observer = new MutationObserver(update);
  // Inline brand variables are our output, so observing style would cause a loop.
  for (const node of [document.documentElement,document.body]) observer.observe(node,{attributes:true,attributeFilter:['class','data-theme']});
  media.addEventListener('change',update);
  update();
  return () => { observer.disconnect(); media.removeEventListener('change',update); };
}
