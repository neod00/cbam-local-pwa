const db = await new Promise((res) => { const r = indexedDB.open('cbam-local'); r.onsuccess = () => res(r.result); });
const all = await new Promise((res) => { const q = db.transaction('installations').objectStore('installations').getAll(); q.onsuccess = () => res(q.result); });
return JSON.stringify(all.map((i) => [i.local_name, i.created_at]));
