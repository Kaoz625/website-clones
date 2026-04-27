import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded' });

const stories = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.athing'));
  return rows.slice(0, 10).map(row => {
    const titleEl = row.querySelector('.titleline > a');
    const scoreEl = document.querySelector(`#score_${row.id}`);
    const subtextEl = row.nextElementSibling;
    const siteEl = row.querySelector('.sitestr');
    return {
      title: titleEl?.textContent?.trim() ?? '',
      url: titleEl instanceof HTMLAnchorElement ? titleEl.href : '',
      score: scoreEl?.textContent?.replace(' points', '') ?? '0',
      site: siteEl?.textContent?.trim() ?? '',
    };
  });
});

await browser.close();

console.log(JSON.stringify(stories, null, 2));
