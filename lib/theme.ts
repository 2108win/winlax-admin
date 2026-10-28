export const THEME_STORAGE_KEY = "wa-theme";

/** Runs before the page paints (see app/layout.tsx), so a saved theme never flashes the default. */
export const themeBootScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t)document.documentElement.dataset.theme=t}catch(e){}`;
