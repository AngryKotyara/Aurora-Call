const NS = "http://www.w3.org/2000/svg";

function makePath(svg, className, d) {
  const path = document.createElementNS(NS, "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  svg.appendChild(path);
}

export function mountXperiaFlow(root = document) {
  root.querySelectorAll(".xperia-flow").forEach((host) => {
    if (host.dataset.ready === "true") return;
    host.dataset.ready = "true";

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 360");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    // Broad translucent layers form the body of the luminous ribbon.
    makePath(svg, "xf-smoke xf-smoke-back", "M-120 150 C70 72 170 105 315 168 C455 228 545 258 690 190 C820 130 930 98 1120 142");
    makePath(svg, "xf-smoke xf-smoke-mid", "M-120 188 C60 116 175 128 322 188 C470 249 560 282 710 207 C845 140 955 122 1120 164");
    makePath(svg, "xf-smoke xf-smoke-front", "M-120 216 C55 151 180 145 330 203 C485 264 575 300 730 220 C862 151 972 146 1120 183");

    // Thin light filaments create the glass/neon edge visible in the reference.
    makePath(svg, "xf-filament xf-filament-blue", "M-110 142 C72 82 178 104 320 165 C462 226 548 247 695 184 C832 126 946 105 1110 145");
    makePath(svg, "xf-filament xf-filament-pink", "M-110 194 C62 122 180 132 326 191 C478 252 566 278 716 204 C852 138 958 128 1110 166");
    makePath(svg, "xf-filament xf-filament-white", "M-110 174 C66 102 180 118 324 180 C470 243 557 266 704 196 C840 132 950 116 1110 157");

    host.appendChild(svg);
  });
}
