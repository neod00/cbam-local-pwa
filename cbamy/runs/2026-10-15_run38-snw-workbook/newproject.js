const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '새 프로젝트'); if (!b) return 'no button';
b.click(); await new Promise((r) => setTimeout(r, 4000));
const db = await new Promise((res) => { const r = indexedDB.open('cbam-local'); r.onsuccess = () => res(r.result); });
const count = (n) => new Promise((res) => { const q = db.transaction(n).objectStore(n).count(); q.onsuccess = () => res(q.result); });
return 'products ' + (await count('products')) + ' processes ' + (await count('processes'));
