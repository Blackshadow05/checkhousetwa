const SPLASH_SESSION_KEY = "casitas-splash";
const INSTALLED_QUERY = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)";

export const SPLASH_BOOT_SCRIPT = `(function(){var d=document.documentElement,n=navigator;if(n.standalone!==true&&!matchMedia(${JSON.stringify(INSTALLED_QUERY)}).matches)return;try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_SESSION_KEY)}))return;sessionStorage.setItem(${JSON.stringify(SPLASH_SESSION_KEY)},"1")}catch(e){}d.dataset.splash=/Android/i.test(n.userAgent)?"android":"compact"})()`;
