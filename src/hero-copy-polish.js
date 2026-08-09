function updateHeroCopy() {
  document.querySelectorAll('.home-hero').forEach((hero) => {
    const copy = hero.querySelector('.home-copy');
    if (!copy || copy.dataset.stayInTouch === 'true') return;

    const title = copy.querySelector('h1');
    const subtitle = copy.querySelector('p');
    if (title) title.textContent = 'Stay in touch';
    if (subtitle) subtitle.remove();

    copy.dataset.stayInTouch = 'true';
    copy.classList.add('stay-in-touch-copy');
  });
}

updateHeroCopy();

const root = document.getElementById('root');
if (root) {
  new MutationObserver(updateHeroCopy).observe(root, { childList: true, subtree: true });
}
