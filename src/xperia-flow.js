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
        <linearGradient id="auroraSmokeGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#4f46ff"/>
          <stop offset=".24" stop-color="#7b35ff"/>
          <stop offset=".48" stop-color="#d742ff"/>
          <stop offset=".68" stop-color="#ff45c8"/>
          <stop offset=".86" stop-color="#735cff"/>
          <stop offset="1" stop-color="#3f72ff"/>
        </linearGradient>
        <linearGradient id="auroraLightGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#877aff" stop-opacity=".12"/>
          <stop offset=".2" stop-color="#d8c7ff" stop-opacity=".82"/>
          <stop offset=".5" stop-color="#fff0ff" stop-opacity="1"/>
          <stop offset=".72" stop-color="#ff9df1" stop-opacity=".9"/>
          <stop offset="1" stop-color="#82a8ff" stop-opacity=".16"/>
        </linearGradient>
        <filter id="auroraSmokeDistort" x="-25%" y="-60%" width="150%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.018" numOctaves="2" seed="7" result="noise">
            <animate attributeName="baseFrequency" dur="9s" values="0.004 0.018;0.006 0.026;0.003 0.014;0.004 0.018" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="38" xChannelSelector="R" yChannelSelector="B"/>
          <feGaussianBlur stdDeviation="5.5"/>
        </filter>
        <filter id="auroraSmokeSoft" x="-25%" y="-70%" width="150%" height="240%">
          <feTurbulence type="fractalNoise" baseFrequency="0.003 0.013" numOctaves="2" seed="19" result="noise2">
            <animate attributeName="baseFrequency" dur="12s" values="0.003 0.013;0.005 0.021;0.0025 0.011;0.003 0.013" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise2" scale="52" xChannelSelector="G" yChannelSelector="R"/>
          <feGaussianBlur stdDeviation="13"/>
        </filter>
      </defs>
      <g class="aurora-smoke-clouds">
        <path class="smoke-layer smoke-back" d="M-150 215 C40 120 150 245 325 180 C485 120 565 78 735 164 C905 250 1020 110 1350 186"/>
        <path class="smoke-layer smoke-mid" d="M-150 196 C20 268 185 110 350 185 C505 255 600 92 770 168 C950 247 1090 114 1350 175"/>
        <path class="smoke-layer smoke-front" d="M-150 235 C45 145 180 268 360 198 C520 135 620 104 790 185 C965 268 1090 120 1350 196"/>
      </g>
      <g class="aurora-smoke-filaments">
        <path class="smoke-filament smoke-filament-main" d="M-150 201 C25 134 175 255 345 184 C500 118 605 101 765 169 C930 239 1090 120 1350 177"/>
        <path class="smoke-filament smoke-filament-pink" d="M-150 226 C38 151 178 268 360 195 C525 129 620 117 785 183 C958 253 1100 132 1350 190"/>
      </g>`;
    host.appendChild(svg);
  });
}
