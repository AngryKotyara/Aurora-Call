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
    svg.setAttribute("viewBox", "0 0 1000 300");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    makePath(svg, "xf-ribbon xf-ribbon-a", "M-80 185 C80 85 190 245 350 150 C520 48 610 210 790 122 C900 68 1015 105 1100 158");
    makePath(svg, "xf-ribbon xf-ribbon-b", "M-100 205 C70 130 205 185 330 168 C500 145 595 65 760 118 C900 162 1000 86 1100 110");
    makePath(svg, "xf-ribbon xf-ribbon-c", "M-80 174 C95 214 195 120 350 154 C515 190 610 115 760 140 C890 162 1005 122 1100 92");
    makePath(svg, "xf-highlight", "M-90 176 C95 112 205 207 350 151 C510 89 620 148 780 119 C915 94 1018 110 1090 143");
    host.appendChild(svg);
  });
}
