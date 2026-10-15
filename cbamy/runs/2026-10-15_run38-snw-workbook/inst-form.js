const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '사업장 추가');
if (!b) return 'no button';
b.click(); await new Promise((r) => setTimeout(r, 800));
return JSON.stringify([...document.querySelectorAll('main input, main select, main textarea')].map((el) => ({ n: el.name || el.id, ph: el.placeholder, req: el.required, label: el.closest('label')?.innerText?.slice(0, 40) })));
