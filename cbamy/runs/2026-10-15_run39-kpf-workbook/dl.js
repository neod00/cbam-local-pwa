const out = [];
const cards = [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === '내려받기');
for (const b of cards) { b.click(); await new Promise((r) => setTimeout(r, 9000)); out.push('clicked'); }
const t = document.querySelector('main').innerText;
return out.length + ' 개 누름\n' + t.split('\n').filter((l) => l.trim()).slice(0, 14).join('\n') + '\n...\n' + t.split('\n').filter((l) => /오류|실패|만들었|받았|내려받/.test(l)).join('\n');
