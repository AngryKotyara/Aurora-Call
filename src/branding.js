export const logoUrl = "/aurora-call-icon-v2.png";
const faviconUrl = "/aurora-call-icon-64-v2.png";
const appleTouchIconUrl = "/apple-touch-icon-v2.png";

export function applyBranding() {
  document.querySelector("#app-icon")?.setAttribute("href", faviconUrl);
  document
    .querySelector("#apple-touch-icon")
    ?.setAttribute("href", appleTouchIconUrl);
}
