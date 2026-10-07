(() => {
  'use strict';
  const data = window.MOCK_GALLERY;
  const gallery = document.querySelector('#gallery');
  const dialog = document.querySelector('#image-viewer');
  const state = { category: 'all', viewport: 'all' };
  const types = { desktop: 'מחשב', tablet: 'טאבלט', mobile: 'נייד' };
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  function view(screen) {
    document.querySelector('#viewer-title').textContent = screen.title;
    document.querySelector('#viewer-meta').textContent = screen.category === 'reference' ? 'קונספט ראשוני שאושר · נשמר ללא שינוי' : 'הממשק שיושם · נתונים סינתטיים';
    const img = document.querySelector('#viewer-image');
    img.src = screen.path;
    img.alt = screen.alt;
    img.parentElement.className = `viewer-content ${screen.viewport}`;
    document.querySelector('#viewer-original').href = screen.path;
    dialog.showModal();
  }
  function card(screen) {
    const article = element('article', `card ${screen.viewport} ${screen.category}`);
    const preview = element('button', 'preview');
    preview.type = 'button';
    if (screen.available) {
      preview.setAttribute('aria-label', `הגדלת ${screen.title} — ${types[screen.viewport]}`);
      const img = element('img');
      img.src = screen.path; img.alt = screen.alt;
      img.loading = screen.category === 'reference' ? 'eager' : 'lazy';
      img.width = screen.width; img.height = screen.height;
      preview.append(img);
      preview.addEventListener('click', () => view(screen));
    } else {
      preview.disabled = true;
      preview.append(element('span', 'pending', 'ממתין לצילום סופי'));
    }
    article.append(preview);
    const info = element('div', 'card-info');
    info.append(element('span', 'kind', screen.category === 'reference' ? 'קונספט ראשוני · מבנה מאושר' : `הממשק שיושם · ${types[screen.viewport]}`));
    const titleRow = element('div', 'card-title-row');
    titleRow.append(element('h2', '', screen.title));
    if (screen.width) titleRow.append(element('span', 'card-dimensions', `${screen.width} × ${screen.height}`));
    info.append(titleRow);
    if (screen.note) info.append(element('p', '', screen.note));
    info.append(element('span', 'filename', screen.file));
    article.append(info);
    return article;
  }
  function render() {
    const screens = data.screens.filter(screen => (state.category === 'all' || screen.category === state.category) && (state.viewport === 'all' || screen.viewport === state.viewport));
    gallery.replaceChildren(...screens.map(card));
    document.querySelector('#visible-count').textContent = `${screens.length} מסכים בתצוגה`;
    document.querySelector('#empty-state').hidden = screens.length > 0;
  }
  for (const [id, key] of [['category-filter', 'category'], ['viewport-filter', 'viewport']]) {
    document.querySelector(`#${id}`).addEventListener('click', event => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      state[key] = button.dataset.value;
      for (const sibling of button.parentElement.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      render();
    });
  }
  document.querySelector('#viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelector('#screen-count').textContent = String(data.screens.filter(screen => screen.category !== 'reference' && screen.available).length);
  document.querySelector('#capture-status').textContent = data.final ? 'צילומים סופיים · סביבת הדגמה' : 'תמונת הכיוון מוכנה · צילומי המימוש בהכנה';
  document.querySelector('#exact-prompt').textContent = data.prompt;
  render();
})();
