// Final auth-screen sizing and CTA polish.
// Keeps authentication behavior intact while matching the requested layout.
const root = document.getElementById("root");

function installStyles() {
  let style = document.getElementById("aurora-auth-screen-polish");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-auth-screen-polish";
    document.head.append(style);
  }

  style.textContent = `
    body:has(.auth-v2) {
      -webkit-text-size-adjust: 100% !important;
      text-size-adjust: 100% !important;
    }

    .auth-v2 {
      width: 390px !important;
      max-width: calc(100vw - 32px) !important;
      transform: none !important;
      zoom: 1 !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    .auth-v2-brand,
    .auth-v2-card,
    .auth-v2-registration,
    .auth-v2-signup {
      transform: none !important;
      zoom: 1 !important;
    }

    /* Keep the A crisp: the SVG already has its own glow, so avoid stacking a large blur around it. */
    .auth-a-logo {
      filter: drop-shadow(0 0 3px rgba(199, 107, 255, .48)) drop-shadow(0 0 8px rgba(112, 67, 255, .26)) !important;
      shape-rendering: geometricPrecision;
    }

    .auth-v2-field input,
    .auth-v2-field textarea,
    .auth-v2-registration .field {
      font-size: 16px !important;
    }

    .auth-v2-divider,
    .auth-v2-socials {
      display: none !important;
    }

    .auth-v2-signup {
      width: 100% !important;
      margin-top: 22px !important;
      color: #bfc1cf !important;
      font-size: 14px !important;
      line-height: 1.35 !important;
    }

    .auth-v2-signup button {
      display: flex !important;
      width: 100% !important;
      min-height: 58px !important;
      align-items: center !important;
      justify-content: center !important;
      margin-top: 11px !important;
      padding: 0 22px !important;
      border: 1px solid rgba(142, 82, 255, .62) !important;
      border-radius: 17px !important;
      background: linear-gradient(135deg, rgba(114, 54, 255, .22), rgba(37, 82, 180, .18)) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 10px 28px rgba(76, 48, 180, .16) !important;
      color: #ffffff !important;
      font-size: 17px !important;
      font-weight: 760 !important;
      letter-spacing: -.01em !important;
    }

    .auth-v2-signup button:active {
      transform: scale(.985) !important;
    }

    @media (max-width: 390px) {
      .auth-v2 {
        width: calc(100vw - 32px) !important;
        max-width: none !important;
      }

      .auth-a-logo {
        width: 132px !important;
        height: 112px !important;
      }

      .auth-v2-brand h1 {
        font-size: 42px !important;
      }

      .auth-v2-brand p {
        margin: 13px 0 28px !important;
        font-size: 17px !important;
      }

      .auth-v2-card,
      .auth-v2-registration {
        padding: 30px 24px 25px !important;
        border-radius: 29px !important;
      }

      .auth-v2-card h2 {
        font-size: 29px !important;
      }
    }
  `;
}

function polish() {
  const shell = root?.querySelector(".auth-v2");
  if (!shell) return;

  shell.querySelector(".auth-v2-divider")?.remove();
  shell.querySelector(".auth-v2-socials")?.remove();

  const signup = shell.querySelector(".auth-v2-signup");
  if (signup && signup.dataset.polished !== "1") {
    signup.dataset.polished = "1";
    const button = signup.querySelector("[data-open-register]");
    if (button) {
      const textNode = [...signup.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      if (textNode) textNode.textContent = "Нет аккаунта?";
      button.textContent = "Регистрация";
    }
  }
}

installStyles();
polish();
if (root)
  new MutationObserver(polish).observe(root, {
    childList: true,
    subtree: true,
  });
