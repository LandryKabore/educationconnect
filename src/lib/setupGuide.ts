const SETUP_FLAG = "ef_setup_guide";

export function enterSetupGuide() {
  sessionStorage.setItem(SETUP_FLAG, "1");
}

export function exitSetupGuide() {
  sessionStorage.removeItem(SETUP_FLAG);
}

export function isSetupGuideActive() {
  return sessionStorage.getItem(SETUP_FLAG) === "1";
}
