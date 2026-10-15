// 사용: window.__group = '이미 있는 자료 처리 고르기' | '공정 묶는 방식 고르기', window.__label = 버튼 글자
const group = document.querySelector(`[aria-label="${window.__group}"]`);
if (!group) return 'NO CARD ' + window.__group;
const b = [...group.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(window.__label));
if (!b) return 'no button ' + window.__label;
b.click(); await new Promise((r) => setTimeout(r, 6000));
const t = document.querySelector('main').innerText; const i = t.indexOf('서식을 넣었습니다');
const card = document.querySelector('[aria-label="공정 묶는 방식 고르기"]') ? ' [합침·나눔 카드가 떴음]' : '';
const backup = t.match(/이전 자료는[^\n]*/)?.[0] ?? '(백업 안내 없음)';
return (i < 0 ? 'NO RESULT' + card : t.slice(i).split('\n').filter((l) => l.trim() && !/CN \d{8} = /.test(l)).slice(0, 3).join('\n')) + '\n' + backup;
