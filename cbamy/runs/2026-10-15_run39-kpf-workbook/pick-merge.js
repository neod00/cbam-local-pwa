window.__group = '공정 묶는 방식 고르기'; window.__label = '한 공정으로 합침';
const group = document.querySelector(`[aria-label="${window.__group}"]`);
if (!group) return 'NO CARD ' + window.__group;
const b = [...group.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(window.__label));
if (!b) return 'no button ' + window.__label + ' / ' + [...group.querySelectorAll('button')].map((x) => x.innerText.trim()).join(' | ');
b.click(); await new Promise((r) => setTimeout(r, 7000));
const t = document.querySelector('main').innerText; const i = t.indexOf('서식을 넣었습니다');
return i < 0 ? 'NO RESULT after pick: ' + t.slice(-900) : t.slice(i).split('\n').filter((l) => l.trim() && !/CN \d{8} = /.test(l)).join('\n');
