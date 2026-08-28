function mountHomeFullscreenFlow() {
  const hero = document.querySelector(".home-hero");
  if (!hero) return;
  const screen = hero.closest(".screen");
  const flow =
    hero.querySelector(".xperia-flow") ||
    screen?.querySelector(":scope > .xperia-flow");
  if (!screen || !flow) return;

  screen.classList.add("home-screen-flow");
  if (flow.parentElement !== screen) screen.prepend(flow);
}

mountHomeFullscreenFlow();
const root = document.getElementById("root");
if (root)
  new MutationObserver(mountHomeFullscreenFlow).observe(root, {
    childList: true,
    subtree: true,
  });
