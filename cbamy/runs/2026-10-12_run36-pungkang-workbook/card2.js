const c = document.querySelector('[aria-label="이미 있는 자료 처리 고르기"]');
return c ? c.innerText.split('\n').filter(Boolean).slice(0, 4).join('\n') : 'NO REPLACE CARD: ' + (document.querySelector('main').innerText.match(/서식을 넣었습니다[^\n]*/)?.[0] ?? '');
