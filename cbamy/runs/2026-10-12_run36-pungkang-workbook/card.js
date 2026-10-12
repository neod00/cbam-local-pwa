const card = document.querySelector('[aria-label="공정 묶는 방식 고르기"]');
return card ? card.innerText : 'NO CARD: ' + (document.querySelector('main').innerText.match(/서식을 넣었습니다[^\n]*/)?.[0] ?? '');
