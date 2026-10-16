const t = document.body.innerText;
const i = t.indexOf('외주');
const lines = t.split('\n').filter((l) => /외주/.test(l));
return lines.slice(0, 14).join('\n');
