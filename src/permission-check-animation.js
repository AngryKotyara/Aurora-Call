const ROOT_SELECTOR = ".media-access";
const ICON_SELECTOR = ".media-access-icon";
const ACTIVE_CLASS = "permission-check-animated";

function isEnabledCard(card) {
  if (card.dataset.mediaStatus === "granted") return true;
  if (card.hasAttribute("data-push-settings")) {
    const title = card.querySelector(".media-access-copy h2")?.textContent || "";
    return title.includes("включены");
  }
  return card.classList.contains("granted");
}

function polishMediaButton(card) {
  if (card.hasAttribute("data-push-settings")) return;
  const button = card.querySelector("[data-request-media]");
  if (!button) return;
  if (card.dataset.mediaStatus === "granted") {
    button.disabled = false;
    button.removeAttribute("disabled");
    button.classList.remove("permission-granted");
    button.textContent = "Отключить доступ";
  }
}

function animateCheck(card) {
  polishMediaButton(card);
  if (!isEnabledCard(card) || card.dataset.permissionAnimationReady === "1") return;
  const icon = card.querySelector(ICON_SELECTOR);
  if (!icon) return;
  card.dataset.permissionAnimationReady = "1";
  icon.classList.remove(ACTIVE_CLASS);
  void icon.offsetWidth;
  icon.classList.add(ACTIVE_CLASS);
}

function scan(root = document) { root.querySelectorAll?.(ROOT_SELECTOR).forEach(animateCheck); }
const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "childList") record.addedNodes.forEach((node) => { if (!(node instanceof Element)) return; if (node.matches?.(ROOT_SELECTOR)) animateCheck(node); scan(node); });
    if (record.type === "attributes" && record.target instanceof Element && record.target.matches(ROOT_SELECTOR)) {
      if (!isEnabledCard(record.target)) record.target.dataset.permissionAnimationReady = "0";
      animateCheck(record.target);
    }
  }
});
function init(){scan();observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","data-media-status"]});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
