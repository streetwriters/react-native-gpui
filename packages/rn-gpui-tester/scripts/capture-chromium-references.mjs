#!/usr/bin/env node
// Captures the Chromium references the text e2e tests compare against, on the
// platform this runs on: the pixels of a few texts, and the height of a line
// that needs a fallback font. A platform's references live in
// `e2e/golden/<platform>/`; macOS's are the files directly in `e2e/golden/`.
//
//   node packages/rn-gpui-tester/scripts/capture-chromium-references.mjs
//
// Needs a Chromium on the PATH (`chromium`, `chromium-browser`, `google-chrome`)
// or in $CHROMIUM, and the tester's Inter fonts, which a tester build copies to
// `desktop/build/assets/assets/fonts/app`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const fonts = path.join(projectRoot, 'desktop/build/assets/assets/fonts/app');
const platform = process.platform;
if (platform === 'darwin') {
  throw new Error('macOS references are the files directly in e2e/golden');
}
const output = path.join(projectRoot, 'e2e/golden', platform);
const work = path.join(projectRoot, 'desktop/build/chromium-capture');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(work, { recursive: true });

const chromium = [
  process.env.CHROMIUM,
  'chromium',
  'chromium-browser',
  'google-chrome',
]
  .filter(Boolean)
  .find(candidate => {
    try {
      execFileSync('which', [candidate], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
if (!chromium) throw new Error('no Chromium found; set CHROMIUM');

const face = (weight, file) =>
  `@font-face{font-family:Inter;font-weight:${weight};src:url(${pathToFileURL(path.join(fonts, file))})}`;
const style = `${face(400, 'Inter-Regular.ttf')}${face(600, 'Inter-SemiBold.ttf')}${face(800, 'Inter-ExtraBold.ttf')}body{margin:0}div{box-sizing:border-box;overflow:hidden}`;
const flags = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--font-render-hinting=none',
];

// A page shows its content once the Inter faces are loaded: a face loads
// lazily, and a capture taken before it did would be set in a fallback font.
const loaded = (after = '') =>
  `<script>document.body.style.visibility='hidden';Promise.all(['400 13px Inter','600 15px Inter','800 15px Inter'].map(font=>document.fonts.load(font))).then(()=>{document.body.style.visibility='visible';${after}})</script>`;

function page(name, html, after) {
  const file = path.join(work, `${name}.html`);
  fs.writeFileSync(
    file,
    `<!doctype html><html><head><style>${style}</style></head><body>${html}${loaded(after)}</body></html>`,
  );
  return file;
}

function shoot(name, html, width, height) {
  const file = page(name, html);
  const png = path.join(work, `${name}.png`);
  execFileSync(
    chromium,
    [
      ...flags,
      `--window-size=${Math.ceil(width) + 40},${Math.ceil(height) + 40}`,
      '--virtual-time-budget=3000',
      `--screenshot=${png}`,
      pathToFileURL(file).href,
    ],
    { stdio: 'ignore' },
  );
  const full = PNG.sync.read(fs.readFileSync(png));
  const cropped = new PNG({
    width: Math.round(width * 2),
    height: Math.round(height * 2),
  });
  PNG.bitblt(full, cropped, 0, 0, cropped.width, cropped.height, 0, 0);
  return cropped;
}

const text = (width, height, background, font, color, extra, content) =>
  `<div style="width:${width}px;height:${height}px;background:${background}"><div style="font:${font};color:${color};${extra}">${content}</div></div>`;

const captures = {
  'chromium-inter-13-400-favorites': [
    60,
    15.5,
    text(60, 15.5, '#f6f7f9', '400 13px Inter', '#474747', '', 'Favorites'),
  ],
  'chromium-inter-15-600-meeting-notes': [
    104,
    18,
    text(104, 18, '#ffffff', '600 15px Inter', '#181818', '', 'Meeting notes'),
  ],
  'chromium-dark-inter-13-400-favorites': [
    60,
    15.5,
    text(60, 15.5, '#181818', '400 13px Inter', '#f2f2f2', '', 'Favorites'),
  ],
  'chromium-dark-inter-15-600-meeting-notes': [
    104,
    18,
    text(104, 18, '#181818', '600 15px Inter', '#ffffff', '', 'Meeting notes'),
  ],
  'chromium-inter-13-400-description': [
    349,
    38.5,
    text(
      349,
      38.5,
      '#ffffff',
      '400 13px/19.2px Inter',
      '#474747',
      'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden',
      'Meeting notes. A short body of text that continues for a few words so the list shows a headline under the title.',
    ),
  ],
};

for (const [name, [width, height, html]] of Object.entries(captures)) {
  const png = shoot(name, html, width, height);
  fs.writeFileSync(path.join(output, `${name}.png`), PNG.sync.write(png));
  console.log(`${name}: ${png.width}x${png.height}`);
}

const measure = page(
  'metrics',
  `<div id="short" style="font:600 15px Inter;white-space:nowrap;display:inline-block">Short title</div><br><div id="fallback" style="font:600 15px Inter;white-space:nowrap;display:inline-block">Accents and symbols: café, naïve, 日本語, emoji 🙂</div>`,
  `document.title=JSON.stringify({short:document.getElementById('short').getBoundingClientRect().height,fallback:document.getElementById('fallback').getBoundingClientRect().height})`,
);
const dom = execFileSync(
  chromium,
  [
    ...flags,
    '--virtual-time-budget=2000',
    '--dump-dom',
    pathToFileURL(measure).href,
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
);
const metrics = JSON.parse(
  /<title>(.*?)<\/title>/su.exec(dom)[1].replace(/&quot;/gu, '"'),
);
fs.writeFileSync(
  path.join(output, 'chromium-metrics.json'),
  `${JSON.stringify({ shortTitle: metrics.short, fallbackTitle: metrics.fallback }, null, 2)}\n`,
);
console.log('metrics', metrics);
