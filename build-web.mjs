// Builds www/ from the shared app source (../app/src or ./web) + native bridge bundle.
import { build } from 'esbuild';
import fs from 'fs';
const src = fs.existsSync('web') ? 'web' : '../app/src';
fs.mkdirSync('www/fonts', { recursive: true });
for (const f of ['Vazirmatn-Regular.woff2', 'Vazirmatn-Bold.woff2']) fs.copyFileSync('node_modules/vazirmatn/fonts/webfonts/' + f, 'www/fonts/' + f);
fs.copyFileSync('node_modules/vazirmatn/OFL.txt', 'www/fonts/OFL.txt');
await build({ entryPoints: ['src/native.js'], bundle: true, format: 'iife', outfile: 'www/native.js', minify: true, target: 'es2019' });
const css = fs.readFileSync(src + '/style.css', 'utf8');
const font = `@font-face{font-family:Vazirmatn;font-weight:400;font-display:swap;src:url(fonts/Vazirmatn-Regular.woff2) format('woff2')}@font-face{font-family:Vazirmatn;font-weight:700;font-display:swap;src:url(fonts/Vazirmatn-Bold.woff2) format('woff2')}html,body{overscroll-behavior:none}`;
const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1F5E57">
<title>اپلیکیشن درسی پارامیس تک</title>
<style>${font}${css}</style>
</head>
<body>
<div id="app"></div>
<script src="native.js"></script>
<script>${fs.readFileSync(src + '/logic.js', 'utf8')}</script>
<script>${fs.readFileSync(src + '/app.js', 'utf8')}</script>
</body>
</html>`;
fs.writeFileSync('www/index.html', html);
console.log('www built from', src, html.length);
