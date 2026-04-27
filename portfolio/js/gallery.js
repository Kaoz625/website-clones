import { getState, setState } from './state.js';

const DESIGNS = [
  {
    id: 'cinemaflow-dark',
    base: 'cinemaflow',
    name: 'Cinemaflow',
    variant: 'Dark Gold',
    desc: 'Full-screen video hero, bold editorial typography, and warm gold accents on deep black.',
    tags: ['Dark & Moody', 'Luxury', 'Editorial'],
    thumb: 'thumb-cinemaflow',
    icon: '◆',
    filter: 'dark',
  },
  {
    id: 'cinemaflow-light',
    base: 'cinemaflow',
    name: 'Cinemaflow',
    variant: 'Warm Light',
    desc: 'The same editorial structure on a warm ivory canvas — refined and airy.',
    tags: ['Light & Clean', 'Luxury', 'Minimal'],
    thumb: 'thumb-cinemaflow-light',
    icon: '◇',
    filter: 'light',
  },
  {
    id: 'cinemaflow-bold',
    base: 'cinemaflow',
    name: 'Cinemaflow',
    variant: 'Bold Violet',
    desc: 'Deep violet palette with gold accents — a dramatic, unforgettable statement.',
    tags: ['Dark & Moody', 'Bold', 'Dramatic'],
    thumb: 'thumb-cinemaflow-bold',
    icon: '◈',
    filter: 'bold',
  },
  {
    id: 'cinery-dark',
    base: 'cinery',
    name: 'Cinery',
    variant: 'Midnight',
    desc: 'Immersive editorial grid with oversized type and deep space aesthetics.',
    tags: ['Dark & Moody', 'Editorial', 'Bold'],
    thumb: 'thumb-cinery',
    icon: '✦',
    filter: 'dark',
  },
  {
    id: 'cinery-warm',
    base: 'cinery',
    name: 'Cinery',
    variant: 'Warm Dark',
    desc: 'The editorial grid with deep amber warmth — rich texture on black.',
    tags: ['Dark & Moody', 'Warm', 'Editorial'],
    thumb: 'thumb-cinery-warm',
    icon: '✧',
    filter: 'dark',
  },
  {
    id: 'cinery-minimal',
    base: 'cinery',
    name: 'Cinery',
    variant: 'Minimal Light',
    desc: 'The structural grid stripped to essentials on a white canvas.',
    tags: ['Light & Clean', 'Minimal', 'Editorial'],
    thumb: 'thumb-cinery-minimal',
    icon: '□',
    filter: 'minimal',
  },
  {
    id: 'cinemax-dark',
    base: 'cinemax',
    name: 'Cinemax',
    variant: 'Ocean Dark',
    desc: 'Poster-grid layout with deep teal and navy. Commanding, modern presence.',
    tags: ['Dark & Moody', 'Bold', 'Modern'],
    thumb: 'thumb-cinemax',
    icon: '◉',
    filter: 'dark',
  },
  {
    id: 'cinemax-midnight',
    base: 'cinemax',
    name: 'Cinemax',
    variant: 'Pure Midnight',
    desc: 'All black with teal highlights — cinematic, focused, zero distraction.',
    tags: ['Dark & Moody', 'Minimal', 'Bold'],
    thumb: 'thumb-cinemax-midnight',
    icon: '◎',
    filter: 'dark',
  },
  {
    id: 'cinemax-ocean',
    base: 'cinemax',
    name: 'Cinemax',
    variant: 'Deep Ocean',
    desc: 'A rich navy foundation with teal energy — trustworthy and striking.',
    tags: ['Dark & Moody', 'Trust', 'Modern'],
    thumb: 'thumb-cinemax-ocean',
    icon: '◒',
    filter: 'bold',
  },
];

const SECTION_ICONS = {
  Hero: '🎬', Navigation: '◈', Services: '⚙', Gallery: '◻', Contact: '✉', Footer: '—',
};

let activeFilter = 'all';

function getRecommendedId() {
  const state = getState();
  const base = state.designProfile?.baseDesign || null;
  if (!base) return null;
  return DESIGNS.find(d => d.base === base)?.id || null;
}

function renderCards() {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  const recommended = getRecommendedId();
  grid.innerHTML = '';

  const filtered = activeFilter === 'all'
    ? DESIGNS
    : DESIGNS.filter(d => d.filter === activeFilter);

  filtered.forEach(design => {
    const isRec = design.id === recommended;
    const card = document.createElement('div');
    card.className = 'design-card' + (isRec ? ' recommended' : '');
    card.dataset.designId = design.id;
    card.innerHTML = `
      <div class="design-card__thumb">
        <div class="design-card__thumb-bg ${design.thumb}">${design.icon}</div>
        <div class="design-card__thumb-overlay">
          <button class="btn btn--ghost btn--sm" data-action="preview" data-id="${design.id}">Preview</button>
          <button class="btn btn--primary btn--sm" data-action="compare" data-id="${design.id}">Compare</button>
        </div>
        ${isRec ? `<div class="design-card__recommended"><span class="badge badge--gold">✦ Recommended for you</span></div>` : ''}
      </div>
      <div class="design-card__body">
        <div class="design-card__header">
          <h3 class="design-card__name">${design.name}</h3>
          <span class="badge ${getBadgeClass(design.base)}">${design.variant}</span>
        </div>
        <p class="design-card__desc">${design.desc}</p>
        <div class="design-card__tags">
          ${design.tags.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
        <div class="design-card__actions">
          <button class="btn btn--ghost btn--sm" data-action="preview" data-id="${design.id}">Full Preview</button>
          <button class="btn btn--primary btn--sm" data-action="compare" data-id="${design.id}">Select to Compare →</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { action, id } = btn.dataset;
      if (action === 'preview') openLightbox(id);
      if (action === 'compare') goToCompare(id);
    });
  });

  grid.querySelectorAll('.design-card').forEach(card => {
    card.addEventListener('click', () => openLightbox(card.dataset.designId));
  });
}

function getBadgeClass(base) {
  if (base === 'cinemaflow') return 'badge--gold';
  if (base === 'cinery') return 'badge--violet';
  return 'badge--teal';
}

function openLightbox(designId) {
  const design = DESIGNS.find(d => d.id === designId);
  if (!design) return;
  const overlay = document.getElementById('lightbox');
  if (!overlay) return;

  document.getElementById('lb-title').textContent = `${design.name} — ${design.variant}`;
  document.getElementById('lb-desc').textContent = design.desc;
  document.getElementById('lb-preview-bg').className = `lightbox__preview ${design.thumb}`;
  document.getElementById('lb-preview-icon').textContent = design.icon;
  document.getElementById('lb-tags').innerHTML = design.tags.map(t => `<span class="tag">${t}</span>`).join('');

  const compareBtn = document.getElementById('lb-compare');
  compareBtn.onclick = () => { overlay.classList.remove('open'); goToCompare(designId); };

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function goToCompare(designId) {
  const design = DESIGNS.find(d => d.id === designId);
  if (!design) return;
  setState({ compareLeft: design.base });
  window.location.href = 'compare.html';
}

function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderCards();
    });
  });
}

function highlightRecommended() {
  const state = getState();
  const recommended = getRecommendedId();
  const banner = document.getElementById('recommendation-banner');
  if (banner && recommended) {
    const design = DESIGNS.find(d => d.id === recommended);
    if (design) {
      banner.innerHTML = `<span class="badge badge--gold">✦ Your match</span> Based on your quiz, we recommend <strong>${design.name} ${design.variant}</strong>`;
      banner.style.display = 'flex';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCards();
  initFilters();
  highlightRecommended();

  const overlay = document.getElementById('lightbox');
  if (overlay) {
    overlay.querySelector('.lightbox__close')?.addEventListener('click', closeLightbox);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeLightbox(); });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
});
