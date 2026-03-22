export const isStandaloneAppMode = (): boolean => {
  if (typeof window === "undefined") return false;

  const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const displayModeFullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || displayModeFullscreen || iosStandalone;
};
