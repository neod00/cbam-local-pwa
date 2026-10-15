const t = document.querySelector('main').innerText; const i = t.indexOf('서식을 넣었습니다');
return t.slice(i).split('\n').filter((l) => l.trim() && !/CN \d{8} = /.test(l) && l.trim() !== '참고' && l.trim() !== '확인 필요').slice(14).join('\n');
