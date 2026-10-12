const label = window.__choice;
const b = [...document.querySelectorAll('[aria-label="공정 묶는 방식 고르기"] button')].find((x) => x.innerText.trim() === label);
if (!b) return 'no button ' + label;
b.click(); await new Promise((r) => setTimeout(r, 6000));
const t = document.querySelector('main').innerText; const i = t.indexOf('서식을 넣었습니다');
return i < 0 ? 'NO RESULT' : t.slice(i).split('\n').filter((l) => l.trim() && !/CN \d{8} = /.test(l)).slice(0, 24).join('\n');
