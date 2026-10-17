const cards = [...document.querySelectorAll('[aria-label]')].filter((e) => /고르기|확인/.test(e.getAttribute('aria-label')));
const t = document.querySelector('main').innerText;
const i = t.indexOf('채운 활동자료 서식 올리기');
return cards.map((c) => c.getAttribute('aria-label') + '\n' + c.innerText.slice(0, 900)).join('\n---\n') || ('NO CARD\n' + t.slice(i, i + 1200));
