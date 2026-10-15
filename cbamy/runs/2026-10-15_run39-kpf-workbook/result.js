const t = document.querySelector('main').innerText; const i = t.indexOf('서식을 넣었습니다');
return i < 0 ? 'NO RESULT: ' + t.slice(0, 200) : t.slice(i).split('\n').filter((l) => l.trim() && !/CN \d{8} = /.test(l)).join('\n');
