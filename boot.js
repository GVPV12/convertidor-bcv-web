// Aplica skin e idioma guardados antes de pintar, para evitar un parpadeo de colores.
// Antes vivía inline en <head>; como archivo propio, la Content-Security-Policy
// (ver _headers) puede prohibir todo script inline sin romper esto.
try {
  const skins = ['fluid', 'hologram', 'emerald'];
  const s = JSON.parse(localStorage.getItem('bcv-settings') || '{}');
  // "Skin aleatoria al iniciar": elige una distinta a la última y la guarda para app.js.
  if (s.randomSkin) {
    const pool = skins.filter((k) => k !== s.skin);
    s.skin = pool[Math.floor(Math.random() * pool.length)];
    localStorage.setItem('bcv-settings', JSON.stringify(s));
  }
  if (skins.includes(s.skin)) document.documentElement.dataset.skin = s.skin;
  if (s.simple) document.documentElement.dataset.simple = 'true';
  if (s.verify) document.documentElement.dataset.verify = 'true';
  if (s.lang === 'en') document.documentElement.lang = 'en';
} catch (e) {}
