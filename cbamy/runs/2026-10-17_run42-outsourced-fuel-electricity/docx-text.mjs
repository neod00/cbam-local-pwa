import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const fflate = createRequire(import.meta.url)('fflate');
const [file, from, to] = process.argv.slice(2);
const xml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(readFileSync(file)))['word/document.xml']);
const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('')).filter(Boolean);
const a = paras.findIndex((p) => p.includes(from));
const b = to ? paras.findIndex((p, i) => i > a && p.includes(to)) : a + 90;
console.log(paras.slice(a, b < 0 ? a + 90 : b).join('\n'));
