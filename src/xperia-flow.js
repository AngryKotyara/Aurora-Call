const NS = "http://www.w3.org/2000/svg";

export function mountXperiaFlow(root = document) {
  root.querySelectorAll(".xperia-flow").forEach((host) => {
    if (host.dataset.ready === "true") return;
    host.dataset.ready = "true";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1200 720");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
      <defs>
        <linearGradient id="auroraRibbonFill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ff42d7" stop-opacity=".78"/>
          <stop offset=".26" stop-color="#a63cff" stop-opacity=".72"/>
          <stop offset=".55" stop-color="#7346ff" stop-opacity=".66"/>
          <stop offset=".78" stop-color="#4f63ff" stop-opacity=".7"/>
          <stop offset="1" stop-color="#39a2ff" stop-opacity=".72"/>
        </linearGradient>
        <linearGradient id="auroraRibbonLight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffd7fb" stop-opacity=".28"/>
          <stop offset=".35" stop-color="#fff4ff" stop-opacity=".9"/>
          <stop offset=".66" stop-color="#d9d7ff" stop-opacity=".84"/>
          <stop offset="1" stop-color="#bcecff" stop-opacity=".3"/>
        </linearGradient>
      </defs>
      <g class="aurora-ribbon-group">
        <path class="aurora-ribbon" d="M-150 210 C35 85 180 120 330 245 C470 365 585 520 735 505 C875 491 935 300 1065 195 C1180 100 1290 120 1370 205 L1370 520 C1245 610 1110 625 990 560 C860 488 785 365 655 355 C520 346 430 480 300 552 C150 634 15 585 -150 475 Z"/>
        <path class="aurora-ribbon-highlight" d="M-120 275 C85 150 215 180 360 300 C492 409 585 442 700 420 C835 394 916 265 1045 215 C1165 168 1270 190 1350 260"/>
        <path class="aurora-ribbon-sheen" d="M-110 395 C80 470 190 470 318 397 C445 325 528 286 650 306 C790 329 862 438 985 475 C1110 512 1230 470 1350 385"/>
      </g>`;
    host.appendChild(svg);
  });
}
