// Builds a bespoke "self-constructing" contribution graph as an animated SVG.
// A coral light sweeps left→right and the squares materialize behind it —
// the year being *built*, not eaten. Pulls the real GitHub contribution
// calendar via GraphQL (GITHUB_TOKEN). Outputs light + dark variants.
import { writeFileSync, mkdirSync } from 'node:fs';

const login = process.env.LOGIN || 'ndresca';
const token = process.env.GH_TOKEN;
if (!token) { console.error('Missing GH_TOKEN'); process.exit(1); }

const query = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ contributionCount date } }
      }
    }
  }
}`;

const resp = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'contrib-graph',
  },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await resp.json();
if (json.errors || !json.data?.user) {
  console.error('GraphQL error:', JSON.stringify(json.errors || json, null, 2));
  process.exit(1);
}
const cal = json.data.user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks;
const total = cal.totalContributions;

const CELL = 12, STEP = 15;
const LEFT = 26, TOP = 56;
const cols = weeks.length;
const gridRight = LEFT + cols * STEP;
const gridBottom = TOP + 7 * STEP;
const W = gridRight + 22;
const H = gridBottom + 18;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const level = (c) => (c <= 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 9 ? 3 : 4);

const THEMES = {
  light: { empty:'#ebedf0', ramp:['#ffd9cb','#ff9d7d','#ff6a3d','#e8431d'], text:'#57606a', total:'#e8431d', sweep:'#ff6a3d' },
  dark:  { empty:'#15151a', ramp:['#5e2a1b','#a23c1d','#e85328','#ff7d52'], text:'#9aa0a8', total:'#ff7a4f', sweep:'#ff6a3d' },
};

function build(name) {
  const t = THEMES[name];
  const sweepDur = (cols * 0.035).toFixed(2);
  const buildEnd = (0.35 + cols * 0.035 + 0.5).toFixed(2);
  let cells = '', months = '', lastMonth = -1;

  weeks.forEach((wk, w) => {
    const x = LEFT + w * STEP;
    const first = wk.contributionDays[0];
    if (first) {
      const m = new Date(first.date + 'T00:00:00Z').getUTCMonth();
      if (m !== lastMonth && w < cols - 1) {
        months += `<text x="${x}" y="${TOP - 10}" font-family="ui-monospace,SF Mono,Menlo,monospace" font-size="10" fill="${t.text}" opacity="0.65">${MONTHS[m]}</text>`;
        lastMonth = m;
      }
    }
    wk.contributionDays.forEach((day) => {
      const d = new Date(day.date + 'T00:00:00Z').getUTCDay();
      const y = TOP + d * STEP;
      const lv = level(day.contributionCount);
      const fill = lv === 0 ? t.empty : t.ramp[lv - 1];
      const begin = (0.35 + w * 0.035).toFixed(3);
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${fill}" opacity="0"><animate attributeName="opacity" begin="${begin}s" dur="0.5s" values="0;1" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/></rect>`;
    });
  });

  const barH = 7 * STEP + 4, barY = TOP - 4;
  const buildSweep = `<rect y="${barY}" width="3" height="${barH}" fill="${t.sweep}" opacity="0"><animate attributeName="x" values="${LEFT - 4};${gridRight}" dur="${sweepDur}s" begin="0.35s" fill="freeze" calcMode="linear"/><animate attributeName="opacity" values="0;0.85;0.85;0" keyTimes="0;0.08;0.9;1" dur="${sweepDur}s" begin="0.35s" fill="freeze"/></rect>`;
  const ambient = `<rect y="${barY}" width="64" height="${barH}" fill="url(#amb-${name})"><animate attributeName="x" values="${LEFT - 64};${gridRight}" dur="6s" begin="${buildEnd}s" repeatCount="indefinite" calcMode="linear"/><animate attributeName="opacity" values="0;0.12;0" keyTimes="0;0.5;1" dur="6s" begin="${buildEnd}s" repeatCount="indefinite"/></rect>`;

  const totalStr = total.toLocaleString('en-US');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${totalStr} contributions in the last year">
  <defs>
    <linearGradient id="amb-${name}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.sweep}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${t.sweep}" stop-opacity="1"/>
      <stop offset="1" stop-color="${t.sweep}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <text x="${LEFT - 2}" y="32" font-family="ui-monospace,SF Mono,Menlo,monospace" font-size="17" font-weight="700" opacity="0"><tspan fill="${t.total}">${totalStr}</tspan><tspan fill="${t.text}" font-weight="400" font-size="15"> contributions · always building</tspan><animate attributeName="opacity" values="0;1" dur="0.5s" begin="0.1s" fill="freeze"/></text>
  ${months}
  ${cells}
  ${buildSweep}
  ${ambient}
</svg>`;
}

mkdirSync('dist', { recursive: true });
writeFileSync('dist/contrib.svg', build('light'));
writeFileSync('dist/contrib-dark.svg', build('dark'));
console.log(`Wrote dist/contrib.svg + dist/contrib-dark.svg — ${total} contributions, ${cols} weeks`);
