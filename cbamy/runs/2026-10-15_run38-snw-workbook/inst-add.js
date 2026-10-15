const set = (id, v) => { const el = document.getElementById(id) ?? document.querySelector(`[name="${id}"]`); if (!el) return 'missing ' + id; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; };
const out = [];
out.push(set('installation-local-name', '(주)에스 앤 더블류 진례공장(김해)'));
out.push(set('installation-name', 'S&W Corporation Jillye Plant'));
out.push(set('installation-country', 'KR'));
out.push(set('installation-street', '80-24, Gomo-ro, Jillye-myeon'));
out.push(set('installation-city', 'Gimhae'));
await new Promise((r) => setTimeout(r, 300));
const save = [...document.querySelectorAll('button')].find((x) => /^(저장|사업장 저장|추가)$/.test(x.innerText.trim()));
out.push(save ? 'save: ' + save.innerText : 'no save: ' + [...document.querySelectorAll('button')].map((x) => x.innerText.trim()).join('|'));
if (save) { save.click(); await new Promise((r) => setTimeout(r, 1500)); }
const t = document.querySelector('main').innerText;
return out.join(' ; ') + '\n' + t.slice(0, 700);
