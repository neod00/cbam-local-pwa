const db = await new Promise((res) => { const r = indexedDB.open('cbam-local'); r.onsuccess = () => res(r.result); });
const all = await new Promise((res) => { const q = db.transaction('precursors').objectStore('precursors').getAll(); q.onsuccess = () => res(q.result); });
return all.filter((p) => /무역상|VINA/.test(p.name)).map((p) => [p.name.slice(0, 30), p.precursor_cn_code, p.supplier_country, p.data_mode, p.direct_see_tco2e_per_t, p.indirect_see_tco2e_per_t, p.source, (p.default_value_justification || '').slice(0, 260)].join(' | ')).join('\n');
