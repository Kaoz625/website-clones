import { setState, setQuizScore, setDesignProfile, computeRecommendedDesign } from './state.js';

const QUESTIONS = [
  {
    id: 'vibe',
    prompt: 'What vibe fits your brand?',
    options: [
      { value: 'cinemaflow', label: 'Luxury & Refined', desc: 'High-end, editorial feel', viz: 'viz-luxury', icon: '✦' },
      { value: 'cinery',    label: 'Bold & Dramatic',  desc: 'Dark, striking presence', viz: 'viz-bold',    icon: '◆' },
      { value: 'cinemax',   label: 'Friendly & Open',  desc: 'Welcoming, approachable', viz: 'viz-friendly', icon: '◎' },
      { value: 'cinemaflow',label: 'Clean & Minimal',  desc: 'Less is more, pure focus', viz: 'viz-minimal', icon: '□' },
    ],
  },
  {
    id: 'feel',
    prompt: 'How should clients feel?',
    options: [
      { value: 'cinemaflow', label: 'Impressed',   desc: 'Wow factor on first look',    viz: 'viz-luxury',  icon: '★' },
      { value: 'cinery',     label: 'Intrigued',   desc: 'Want to know more',           viz: 'viz-bold',    icon: '◈' },
      { value: 'cinemax',    label: 'Comfortable', desc: 'Safe, easy to contact you',   viz: 'viz-friendly',icon: '♡' },
      { value: 'cinery',     label: 'Confident',   desc: 'You know your stuff',         viz: 'viz-trust',   icon: '◉' },
    ],
  },
  {
    id: 'business',
    prompt: 'What best describes your business?',
    options: [
      { value: 'cinemaflow', label: 'Professional Service', desc: 'Law, finance, consulting', viz: 'viz-service',      icon: '⚖' },
      { value: 'cinemax',    label: 'Product / Shop',       desc: 'E-commerce or retail',    viz: 'viz-product',      icon: '◻' },
      { value: 'cinemaflow', label: 'Restaurant / Food',    desc: 'Dining, catering, food',  viz: 'viz-restaurant',   icon: '◇' },
      { value: 'cinery',     label: 'Creative / Agency',    desc: 'Design, media, branding', viz: 'viz-professional', icon: '✧' },
    ],
  },
  {
    id: 'palette',
    prompt: 'Your color direction?',
    options: [
      { value: 'cinemaflow', label: 'Gold & Black',   desc: 'Rich, premium tones',   viz: 'viz-dark',    icon: '◐' },
      { value: 'cinery',     label: 'Deep Violet',    desc: 'Mysterious, creative',  viz: 'viz-bold',    icon: '◑' },
      { value: 'cinemax',    label: 'Teal & Navy',    desc: 'Ocean, trust, clarity', viz: 'viz-vibrant', icon: '◒' },
      { value: 'cinemaflow', label: 'Warm Neutrals',  desc: 'Earthy, timeless calm', viz: 'viz-earth',   icon: '◓' },
    ],
  },
  {
    id: 'energy',
    prompt: 'Pick your brand energy',
    options: [
      { value: 'cinery',     label: 'High Energy',  desc: 'Dynamic, always moving', viz: 'viz-dynamic', icon: '⚡' },
      { value: 'cinemaflow', label: 'Calm & Steady', desc: 'Reliable, no rush',     viz: 'viz-steady',  icon: '∞' },
      { value: 'cinemax',    label: 'Playful',       desc: 'Fun, unexpected',       viz: 'viz-playful', icon: '✿' },
      { value: 'cinery',     label: 'Authoritative', desc: 'Command the room',      viz: 'viz-trust',   icon: '⬡' },
    ],
  },
];

const DESIGN_META = {
  cinemaflow: {
    name: 'Cinemaflow',
    desc: 'A refined, editorial experience built on bold typography, golden tones, and cinematic transitions. Perfect for luxury service brands.',
    color: 'var(--cinemaflow)',
  },
  cinery: {
    name: 'Cinery',
    desc: 'Dark and dramatic with deep violet accents. Your brand commands attention with editorial flair and immersive scroll storytelling.',
    color: 'var(--cinery)',
  },
  cinemax: {
    name: 'Cinemax',
    desc: 'A bold poster-grid layout with teal and navy energy. Perfect for brands that want presence and clarity in equal measure.',
    color: 'var(--cinemax)',
  },
};

let currentStep = 0;
const answers = {};

function init() {
  const container = document.getElementById('quiz-container');
  if (!container) return;

  renderQuestions(container);
  renderResult(container);
  showStep(0);
  updateProgress();
}

function renderQuestions(container) {
  QUESTIONS.forEach((q, i) => {
    const el = document.createElement('div');
    el.className = 'quiz-question container' + (i === 0 ? ' active' : '');
    el.dataset.step = i;
    el.innerHTML = `
      <p class="quiz-question__prompt fade-up">${q.prompt}</p>
      <div class="quiz-options">
        ${q.options.map((opt, j) => `
          <div class="quiz-option" data-question="${q.id}" data-value="${opt.value}" data-index="${j}">
            <div class="quiz-option__visual ${opt.viz}">${opt.icon}</div>
            <div class="quiz-option__label">
              <h4>${opt.label}</h4>
              <p>${opt.desc}</p>
            </div>
            <div class="quiz-option__check">✓</div>
          </div>
        `).join('')}
      </div>
    `;
    el.querySelectorAll('.quiz-option').forEach(optEl => {
      optEl.addEventListener('click', () => selectOption(optEl, q.id, i));
    });
    container.appendChild(el);
  });
}

function renderResult(container) {
  const el = document.createElement('div');
  el.className = 'quiz-result container';
  el.id = 'quiz-result';
  el.innerHTML = `
    <span class="quiz-result__label">Your design match</span>
    <div class="quiz-result__design-name" id="result-name"></div>
    <p class="quiz-result__desc" id="result-desc"></p>
    <div class="quiz-result__cta">
      <a href="gallery.html" class="btn btn--primary">Explore all designs →</a>
      <a href="compare.html" class="btn btn--ghost">Compare side by side</a>
    </div>
  `;
  container.appendChild(el);
}

function selectOption(optEl, questionId, stepIndex) {
  const parent = optEl.closest('.quiz-question');
  parent.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
  optEl.classList.add('selected');
  answers[questionId] = optEl.dataset.value;

  setTimeout(() => {
    if (stepIndex < QUESTIONS.length - 1) {
      nextStep();
    } else {
      showResult();
    }
  }, 380);
}

function nextStep() {
  if (currentStep < QUESTIONS.length - 1) {
    showStep(currentStep + 1);
  }
}

function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}

function showStep(index) {
  document.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`[data-step="${index}"]`);
  if (target) target.classList.add('active');
  currentStep = index;
  updateProgress();
  updateNavButtons();
}

function updateProgress() {
  const fill = document.getElementById('progress-fill');
  const stepLabel = document.getElementById('step-label');
  if (fill) fill.style.width = `${((currentStep) / QUESTIONS.length) * 100}%`;
  if (stepLabel) stepLabel.textContent = `${currentStep + 1} / ${QUESTIONS.length}`;
}

function updateNavButtons() {
  const prev = document.getElementById('quiz-prev');
  if (prev) prev.style.opacity = currentStep === 0 ? '0.3' : '1';
}

function showResult() {
  const score = {};
  Object.values(answers).forEach(v => { score[v] = (score[v] || 0) + 1; });

  const recommended = computeRecommendedDesign(score);
  setQuizScore(score);
  setDesignProfile({ baseDesign: recommended, theme: recommended });

  document.querySelectorAll('.quiz-question').forEach(el => el.classList.remove('active'));
  const resultEl = document.getElementById('quiz-result');
  if (!resultEl) return;
  resultEl.classList.add('active');

  const meta = DESIGN_META[recommended];
  const nameEl = document.getElementById('result-name');
  const descEl = document.getElementById('result-desc');
  if (nameEl) { nameEl.textContent = meta.name; nameEl.style.color = meta.color; }
  if (descEl) descEl.textContent = meta.desc;

  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = '100%';
  const stepLabel = document.getElementById('step-label');
  if (stepLabel) stepLabel.textContent = 'Complete';
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  const prevBtn = document.getElementById('quiz-prev');
  if (prevBtn) prevBtn.addEventListener('click', prevStep);
});
