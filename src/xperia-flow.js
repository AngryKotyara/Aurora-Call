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
        <linearGradient id="auroraSmokeGradientA" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#4c4dff"/>
          <stop offset=".28" stop-color="#7d3cff"/>
          <stop offset=".55" stop-color="#d43cff"/>
          <stop offset=".76" stop-color="#ff52ce"/>
          <stop offset="1" stop-color="#4f6cff"/>
        </linearGradient>
        <linearGradient id="auroraSmokeGradientB" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#344fff" stop-opacity=".18"/>
          <stop offset=".36" stop-color="#963cff" stop-opacity=".66"/>
          <stop offset=".68" stop-color="#ff4bd6" stop-opacity=".74"/>
          <stop offset="1" stop-color="#6d5dff" stop-opacity=".2"/>
        </linearGradient>
        <linearGradient id="auroraLightGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#8fa4ff" stop-opacity=".08"/>
          <stop offset=".25" stop-color="#cfc4ff" stop-opacity=".62"/>
          <stop offset=".52" stop-color="#fff4ff" stop-opacity=".98"/>
          <stop offset=".74" stop-color="#ffadf2" stop-opacity=".82"/>
          <stop offset="1" stop-color="#7896ff" stop-opacity=".1"/>
        </linearGradient>
      </defs>
      <g class="aurora-smoke-clouds">
        <path class="smoke-layer smoke-back smoke-upper" d="M-180 130 C30 40 170 200 350 112 C520 28 650 52 815 132 C970 207 1120 42 1380 115"/>
        <path class="smoke-layer smoke-mid smoke-upper-mid" d="M-180 245 C15 145 188 290 365 210 C525 138 650 136 820 210 C985 282 1125 146 1380 215"/>
        <path class="smoke-layer smoke-front smoke-center" d="M-180 365 C22 285 180 430 365 346 C528 272 650 270 820 350 C990 432 1120 285 1380 355"/>
        <path class="smoke-layer smoke-mid smoke-lower-mid" d="M-180 495 C25 405 185 548 365 475 C525 410 650 402 825 485 C996 567 1122 425 1380 482"/>
        <path class="smoke-layer smoke-back smoke-lower" d="M-180 620 C28 530 180 685 370 592 C530 515 654 535 830 610 C998 682 1130 530 1380 602"/>
      </g>
      <g class="aurora-smoke-filaments">
        <path class="smoke-filament smoke-filament-main filament-upper" d="M-180 228 C24 140 182 292 360 208 C522 132 646 134 812 205 C980 278 1115 145 1380 211"/>
        <path class="smoke-filament smoke-filament-pink filament-center" d="M-180 367 C35 284 182 430 372 346 C535 274 650 280 818 350 C988 420 1118 292 1380 357"/>
        <path class="smoke-filament smoke-filament-main filament-lower" d="M-180 505 C28 412 190 555 374 477 C538 408 653 413 824 487 C994 558 1126 430 1380 490"/>
      </g>`;
    host.appendChild(svg);
  });
}
