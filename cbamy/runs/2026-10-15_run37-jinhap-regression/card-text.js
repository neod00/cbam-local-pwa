const c = document.querySelector('[aria-label="공정 묶는 방식 고르기"]');
return c ? c.innerText.split('\n').filter(Boolean).join('\n') : 'NO GROUPING CARD: ' + (document.querySelector('main').innerText.match(/서식을 넣었습니다[^\n]*/)?.[0] ?? '(없음)');
