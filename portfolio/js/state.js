const STATE_KEY = 'designPortfolio';

const defaults = {
  designProfile: { theme: null, baseDesign: null, colorPalette: null },
  quizAnswers: {},
  quizScore: {},
  elementSelections: { hero: null, nav: null, services: null, gallery: null, contact: null, footer: null },
  compareLeft: 'cinemaflow',
  compareRight: 'cinery',
};

export function getState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function setState(partial) {
  const current = getState();
  const next = { ...current, ...partial };
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
  return next;
}

export function resetState() {
  localStorage.removeItem(STATE_KEY);
}

export function getDesignProfile() {
  return getState().designProfile;
}

export function setDesignProfile(profile) {
  return setState({ designProfile: { ...getState().designProfile, ...profile } });
}

export function getElementSelections() {
  return getState().elementSelections;
}

export function setElementSelection(section, design) {
  const current = getState().elementSelections;
  return setState({ elementSelections: { ...current, [section]: design } });
}

export function getQuizScore() {
  return getState().quizScore;
}

export function setQuizScore(score) {
  return setState({ quizScore: score });
}

// Compute recommended design from quiz score
export function computeRecommendedDesign(score) {
  const entries = Object.entries(score);
  if (!entries.length) return 'cinemaflow';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
