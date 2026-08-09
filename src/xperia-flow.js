const NS = "http://www.w3.org/2000/svg";

export function mountXperiaFlow(root = document) {
  root.querySelectorAll(".xperia-flow").forEach((host) => {
    if (host.dataset.ready === "true") return;
    host.dataset.ready = "true";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1200 360");
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
        <path class="smoke-layer smoke-back" d="M-180 218 C10 134 138 242 316 188 C472 141 582 95 746 170 C914 247 1030 124 1380 183"/>
        <path class="smoke-layer smoke-mid" d="M-180 198 C22 266 176 112 350 184 C508 250 616 105 784 176 C950 246 1094 126 1380 171"/>
        <path class="smoke-layer smoke-front" d="M-180 232 C18 150 188 275 372 198 C532 131 648 122 806 188 C984 263 1112 138 1380 193"/>
      </g>
      <g class="aurora-smoke-filaments">
        <path class="smoke-filament smoke-filament-main" d="M-180 201 C18 128 184 260 358 187 C516 120 626 111 789 175 C958 243 1100 126 1380 178"/>
        <path class="smoke-filament smoke-filament-pink" d="M-180 226 C32 154 186 271 376 196 C540 132 650 130 816 187 C992 248 1118 141 1380 192"/>
      </g>`;
    host.appendChild(svg);
  });
}
