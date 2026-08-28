export const logoUrl = "/aurora-call-logo.png";

export function applyBranding() {
  document.querySelector("#app-icon")?.setAttribute("href", logoUrl);
  document.querySelector("#apple-touch-icon")?.setAttribute("href", logoUrl);
}
