import { logoUrl } from "./branding-data.js";

export { logoUrl };

export function applyBranding() {
  document.querySelector("#app-icon")?.setAttribute("href", logoUrl);
  document.querySelector("#apple-touch-icon")?.setAttribute("href", logoUrl);
}
