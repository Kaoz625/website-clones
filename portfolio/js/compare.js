import { getState, setState, setElementSelection, getElementSelections } from './state.js';

const DESIGNS = {
  cinemaflow: {
    name: 'Cinemaflow',
    color: 'var(--cinemaflow)',
    traits: ['Dark Gold', 'Editorial', 'Luxury'],
    icon: '◆',
    thumb: 'thumb-cinemaflow',
    bg: 'background: linear-gradient(135deg, #050505 0%, #1a1208 100%)',
  },
  cinery: {
    name: 'Cinery',
    color: 'var(--cinery)',
    traits: ['Midnight', 'Dramatic', 'Bold'],
    icon: '✦',
    thumb: 'thumb-cinery',
    bg: 'background: linear-gradient(135deg, #080808 0%, #0d0d1a 100%)',
  },
  cinemax: {
    name: 'Cinemax',
    color: 'var(--cinemax)',
    traits: ['Ocean Dark', 'Modern', 'Trust'],
    icon: '◉',
    thumb: 'thumb-cinemax',
    bg: 'background: linear-gradient(135deg, #000810 0%, #001428 100%)',
  },
};

const DESIGN_ORDER = ['cinemaflow', 'cinery', 'cinemax'];

const SECTIONS = [
  {
    id: 'hero',
    label: 'Hero Section',
    desc: 'The first thing visitors see',
    options: {
      cinemaflow: { style: 'Full-screen gradient + oversized serif headline', icon: '⬛', bg: 'background: linear-gradient(135deg,#050505,#1a1208)' },
      cinery:     { style: 'Split layout with editorial text + side visual',   icon: '◫', bg: 'background: linear-gradient(135deg,#080808,#0d0d1a)' },
      cinemax:    { style: 'Poster grid with bold title overlay',              icon: '▦', bg: 'background: linear-gradient(135deg,#000810,#001428)' },
    },
  },
  {
    id: 'nav',
    label: 'Navigation',
    desc: 'How clients find their way',
    options: {
      cinemaflow: { style: 'Transparent overlay, thin serif logo, spaced links', icon: '═', bg: 'background: #050505' },
      cinery:     { style: 'Dark bar, bold logotype, icon-right CTA button',     icon: '▬', bg: 'background: #0a0a0a' },
      cinemax:    { style: 'Frosted glass bar with animated underline links',     icon: '▭', bg: 'background: rgba(0,8,16,0.9)' },
    },
  },
  {
    id: 'services',
    label: 'Services Block',
    desc: 'How you present your offerings',
    options: {
      cinemaflow: { style: 'Numbered list with large serif labels and dividers',  icon: '①', bg: 'background: linear-gradient(135deg,#0a0a0a,#111108)' },
      cinery:     { style: 'Icon cards in a 3-column editorial grid',             icon: '⊞', bg: 'background: linear-gradient(135deg,#080808,#0d0810)' },
      cinemax:    { style: 'Alternating full-width rows with image + text',       icon: '≡', bg: 'background: linear-gradient(135deg,#000810,#00101a)' },
    },
  },
  {
    id: 'gallery',
    label: 'Portfolio / Gallery',
    desc: 'Showcase your work or products',
    options: {
      cinemaflow: { style: 'Masonry grid with hover zoom and gold caption',    icon: '⊡', bg: 'background: linear-gradient(135deg,#050505,#1a1208)' },
      cinery:     { style: 'Full-bleed editorial slideshow with text overlay', icon: '▷', bg: 'background: linear-gradient(135deg,#080808,#0d0d1a)' },
      cinemax:    { style: 'Poster tile grid with aspect-locked thumbnails',   icon: '⊟', bg: 'background: linear-gradient(135deg,#000810,#001428)' },
    },
  },
  {
    id: 'contact',
    label: 'Contact Section',
    desc: 'How clients reach you',
    options: {
      cinemaflow: { style: 'Minimal form on dark canvas with large heading',         icon: '✉', bg: 'background: linear-gradient(135deg,#0a0a0a,#111108)' },
      cinery:     { style: 'Two-column: contact info left, form right',              icon: '◫', bg: 'background: linear-gradient(135deg,#080808,#0d0810)' },
      cinemax:    { style: 'Full-width strip with phone/email prominently centered', icon: '⊕', bg: 'background: linear-gradient(135deg,#000810,#00101a)' },
    },
  },
  {
    id: 'footer',
    label: 'Footer',
    desc: 'Close with confidence',
    options: {
      cinemaflow: { style: 'Elegant single-line footer with gold accents and links',   icon: '—', bg: 'background: #050505' },
      cinery:     { style: 'Multi-column footer with social links and site map',        icon: '≡', bg: 'background: #080808' },
      cinemax:    { style: 'Bold CTA footer with tagline and contact button',           icon: '◻', bg: 'background: #000810' },
    },
  },
];

let leftDesign = 'cinemaflow';
let rightDesign = 'cinery';
let selections = {};

function init() {
  const state = getState();
  leftDesign  = state.compareLeft  || state.designProfile?.baseDesign || 'cinemaflow';
  rightDesign = state.compareRight || 'cinery';
  if (leftDesign === rightDesign) rightDesign = DESIGN_ORDER.find(d => d !== leftDesign);
  selections  = { ...state.elementSelections };

  renderPanels();
  renderElementPicker();
  updateCTACount();
}

function renderPanels() {
  renderPanel('left',  leftDesign);
  renderPanel('right', rightDesign);
}

function renderPanel(side, designId) {
  const design = DESIGNS[designId];
  const panel  = document.getElementById(`panel-${side}`);
  if (!panel) return;

  panel.querySelector('.compare-panel__name').textContent  = design.name;
  panel.querySelector('.compare-panel__icon').textContent  = design.icon;
  panel.querySelector('.compare-panel__preview').style     = design.bg;
  panel.querySelector('.compare-panel__preview-icon').textContent = design.icon;

  const traitsEl = panel.querySelector('.compare-panel__traits');
  if (traitsEl) {
    traitsEl.innerHTML = design.traits.map(t => `<span class="tag">${t}</span>`).join('');
  }

  const dotEl = panel.querySelector('.compare-panel__dot');
  if (dotEl) dotEl.style.background = design.color;

  const swapBtn = panel.querySelector('.compare-panel__swap');
  if (swapBtn) {
    swapBtn.onclick = () => cycleDesign(side);
  }

  panel.className = `compare-panel${side === 'left' ? ' active' : ''}`;
}

function cycleDesign(side) {
  const current = side === 'left' ? leftDesign : rightDesign;
  const other   = side === 'left' ? rightDesign : leftDesign;
  const available = DESIGN_ORDER.filter(d => d !== other);
  const idx  = available.indexOf(current);
  const next = available[(idx + 1) % available.length];
  if (side === 'left') leftDesign = next; else rightDesign = next;
  renderPanels();
  setState({ compareLeft: leftDesign, compareRight: rightDesign });
}

function renderElementPicker() {
  const container = document.getElementById('element-sections');
  if (!container) return;
  container.innerHTML = '';

  SECTIONS.forEach(section => {
    const chosen = selections[section.id];
    const el = document.createElement('div');
    el.className = 'element-section';
    el.innerHTML = `
      <div class="element-section__header">
        <span class="element-section__label">${section.label}</span>
        <span class="element-section__selected-badge ${chosen ? 'visible' : ''}" id="badge-${section.id}">
          ${chosen ? `✓ ${DESIGNS[chosen]?.name || chosen}` : ''}
        </span>
      </div>
      <div class="element-options">
        ${Object.entries(section.options).map(([designId, opt]) => `
          <div class="element-option ${chosen === designId ? 'selected' : ''}"
               data-section="${section.id}"
               data-design="${designId}">
            <div class="element-option__thumb" style="${opt.bg}">
              <span style="font-size:2rem">${opt.icon}</span>
              <div class="element-option__check">✓</div>
            </div>
            <div class="element-option__label">
              <div class="element-option__design-name" style="color:${DESIGNS[designId].color}">${DESIGNS[designId].name}</div>
              <div class="element-option__style">${opt.style}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(el);
  });

  container.querySelectorAll('.element-option').forEach(opt => {
    opt.addEventListener('click', () => selectElement(opt));
  });
}

function selectElement(optEl) {
  const { section, design } = optEl.dataset;
  document.querySelectorAll(`[data-section="${section}"]`).forEach(o => o.classList.remove('selected'));
  optEl.classList.add('selected');
  selections[section] = design;
  setElementSelection(section, design);

  const badge = document.getElementById(`badge-${section}`);
  if (badge) {
    badge.textContent = `✓ ${DESIGNS[design]?.name || design}`;
    badge.classList.add('visible');
  }

  updateCTACount();
}

function updateCTACount() {
  const count = Object.values(selections).filter(Boolean).length;
  const total = SECTIONS.length;
  const countEl = document.getElementById('selection-count');
  if (countEl) countEl.innerHTML = `<strong>${count}</strong> of ${total} sections selected`;

  const buildBtn = document.getElementById('build-preview-btn');
  if (buildBtn) {
    buildBtn.textContent = count > 0 ? `Build My Preview (${count} selections) →` : 'Build My Preview →';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('build-preview-btn')?.addEventListener('click', () => {
    window.location.href = 'preview.html';
  });
});
