import { getState } from './state.js';

const DESIGN_META = {
  cinemaflow: { name: 'Cinemaflow', color: 'var(--cinemaflow)', accent: '#e8c87a', bg: 'linear-gradient(135deg,#050505 0%,#1a1208 100%)' },
  cinery:     { name: 'Cinery',     color: 'var(--cinery)',     accent: '#a07cf0', bg: 'linear-gradient(135deg,#080808 0%,#0d0d1a 100%)' },
  cinemax:    { name: 'Cinemax',    color: 'var(--cinemax)',    accent: '#5ce0b8', bg: 'linear-gradient(135deg,#000810 0%,#001428 100%)' },
};

const SECTION_RENDERS = {
  hero: (design) => `
    <div class="preview-section ps-hero" data-section="hero">
      <div class="ps-hero__bg" style="background:${DESIGN_META[design].bg}"></div>
      <div class="ps-hero__content">
        <div class="ps-hero__eyebrow">Welcome to your business</div>
        <h1 class="ps-hero__title">Your Brand.<br>Your Story.</h1>
        <p class="ps-hero__sub">A stunning first impression that converts visitors into clients.</p>
        <a href="#" class="btn btn--primary" style="background:${DESIGN_META[design].accent}">Get Started</a>
      </div>
    </div>`,

  nav: (design) => `
    <div class="preview-section ps-nav" data-section="nav">
      <div class="ps-nav__logo" style="color:${DESIGN_META[design].accent}">Your Brand</div>
      <div class="ps-nav__links">
        <span>About</span><span>Services</span><span>Portfolio</span><span>Contact</span>
      </div>
    </div>`,

  services: (design) => `
    <div class="preview-section ps-services" data-section="services">
      <h2 class="ps-services__title">What We Offer</h2>
      <div class="ps-services__grid">
        ${[['⚙','Strategy','We craft purposeful direction for your brand.'],
           ['◻','Design','Visual systems that feel unmistakably yours.'],
           ['◆','Growth','Built to attract, convert, and retain clients.']
          ].map(([icon,title,desc]) => `
          <div class="ps-service-card" style="border-color:rgba(255,255,255,0.08)">
            <div class="ps-service-card__icon">${icon}</div>
            <div class="ps-service-card__title">${title}</div>
            <p class="ps-service-card__desc">${desc}</p>
          </div>`).join('')}
      </div>
    </div>`,

  gallery: (design) => `
    <div class="preview-section ps-gallery" data-section="gallery">
      <h2 class="ps-gallery__title">Our Work</h2>
      <div class="ps-gallery__grid">
        ${['#1a1208','#0d0d1a','#001428','#1a0a0a','#0a1a0a','#1a1a0a'].map((bg,i) =>
          `<div class="ps-gallery__item" style="background:${bg}">${['◆','✦','◉','◈','◎','◒'][i]}</div>`
        ).join('')}
      </div>
    </div>`,

  contact: (design) => `
    <div class="preview-section ps-contact" data-section="contact">
      <div class="ps-contact__left">
        <h2 class="ps-contact__title">Let's Work<br>Together</h2>
        <div class="ps-contact__field">Your Name</div>
        <div class="ps-contact__field">Email Address</div>
        <div class="ps-contact__field">Tell us about your project…</div>
        <button class="btn btn--primary" style="background:${DESIGN_META[design].accent};margin-top:1rem">Send Message</button>
      </div>
      <div class="ps-contact__right">
        <div class="ps-contact__info" style="color:${DESIGN_META[design].accent}">Contact</div>
        <div class="ps-contact__info">hello@yourbrand.com</div>
        <div class="ps-contact__info">+1 (555) 000-0000</div>
        <div class="ps-contact__info" style="margin-top:1rem;font-size:0.75rem;color:#555">New York, NY</div>
      </div>
    </div>`,

  footer: (design) => `
    <div class="preview-section ps-footer" data-section="footer">
      <span style="color:${DESIGN_META[design].accent}">Your Brand</span>
      <span>© 2026 All rights reserved</span>
      <div style="display:flex;gap:1rem">
        <span>Privacy</span><span>Terms</span><span>Contact</span>
      </div>
    </div>`,
};

const SECTION_ORDER = ['nav', 'hero', 'services', 'gallery', 'contact', 'footer'];

function init() {
  const state = getState();
  const theme = state.designProfile?.baseDesign || 'cinemaflow';
  const selections = state.elementSelections || {};

  const canvas = document.getElementById('preview-canvas');
  if (!canvas) return;

  const wrapper = canvas.closest('[data-theme]') || canvas;
  wrapper.dataset.theme = theme;

  canvas.innerHTML = '';

  SECTION_ORDER.forEach(sectionId => {
    const design = selections[sectionId] || theme;
    const renderer = SECTION_RENDERS[sectionId];
    if (renderer) canvas.insertAdjacentHTML('beforeend', renderer(design));
  });

  renderSidebar(state, theme);
  animateSections();
}

function renderSidebar(state, theme) {
  const list = document.getElementById('sidebar-selections');
  if (!list) return;

  const selections = state.elementSelections || {};
  const SECTION_LABELS = { nav: 'Navigation', hero: 'Hero', services: 'Services', gallery: 'Gallery', contact: 'Contact', footer: 'Footer' };
  const DESIGN_META_LOCAL = { cinemaflow: 'Cinemaflow', cinery: 'Cinery', cinemax: 'Cinemax' };

  list.innerHTML = SECTION_ORDER.map(id => {
    const chosen = selections[id] || theme;
    return `
      <div class="sidebar-selection-item">
        <span class="sidebar-selection-item__section">${SECTION_LABELS[id]}</span>
        <span class="sidebar-selection-item__design">${DESIGN_META_LOCAL[chosen]}</span>
        <a href="compare.html" class="sidebar-selection-item__edit">Edit</a>
      </div>`;
  }).join('');

  const themeEl = document.getElementById('sidebar-theme');
  if (themeEl) {
    const meta = { cinemaflow: 'Cinemaflow', cinery: 'Cinery', cinemax: 'Cinemax' };
    themeEl.textContent = meta[theme] || theme;
  }
}

function animateSections() {
  const sections = document.querySelectorAll('.preview-section');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    sections.forEach((s, i) => {
      s.style.transitionDelay = `${i * 80}ms`;
      observer.observe(s);
    });
  } else {
    sections.forEach(s => s.classList.add('visible'));
  }
}

document.addEventListener('DOMContentLoaded', init);
