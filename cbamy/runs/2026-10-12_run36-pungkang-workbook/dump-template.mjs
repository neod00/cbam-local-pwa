// run36 — 빈 서식을 컨설턴트가 보는 그대로(시트·머리글·설명 줄·안내) 글로 뽑는다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const fflate = createRequire(import.meta.url)('fflate');
const files = fflate.unzipSync(new Uint8Array(readFileSync(process.argv[2])));
const text = (name) => new TextDecoder().decode(files[name]);
const un = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
const shared = files['xl/sharedStrings.xml'] ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => un([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
const wb = text('xl/workbook.xml');
const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
const rels = text('xl/_rels/workbook.xml.rels');
for (const [, name, rid] of sheets) {
  const target = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`));
  const xml = text(`xl/${(target[1] ?? target[2]).replace(/^\//, '').replace(/^xl\//, '')}`);
  console.log(`\n=== ${un(name)}`);
  for (const row of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [...row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, col, attrs, body = '']) => {
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('');
      const value = /t="s"/.test(attrs) ? shared[Number(v)] : inline ? un(inline) : v ? un(v) : '';
      return value ? `${col}: ${value}` : '';
    }).filter(Boolean);
    if (cells.length) console.log(`[${row[1]}] ${cells.join(' | ')}`);
  }
  const dvs = [...xml.matchAll(/<dataValidation [^>]*sqref="([^"]+)"[^>]*>[\s\S]*?<formula1>([\s\S]*?)<\/formula1>/g)].map((m) => `${m[1]} ← ${un(m[2]).slice(0, 160)}`);
  if (dvs.length) console.log('  [목록] ' + dvs.join('\n  [목록] '));
}
