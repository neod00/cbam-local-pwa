const t = document.querySelector('main').innerText;
return t.split('\n').filter((l) => /^제출$|1톤당|보낼 수|덜 들어/.test(l)).slice(0, 3).join('\n');
