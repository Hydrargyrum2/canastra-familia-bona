// Statické stránky pro vyhledávače (pravidla ve třech jazycích) + sitemap.
// Spouští se z tools/build.py; texty pravidel bere z src/client/i18n.js, takže jsou vždy stejné jako ve hře.
const fs = require('fs');
const path = require('path');
global.window = global;
require('../src/client/i18n.js');
const D = global.I18N.DICT;
const SITE = 'https://canastra-familia-bona.faldik2033.workers.dev';
const PUB = path.join(__dirname, '..', 'public');
const today = new Date().toISOString().slice(0, 10);

const PAGES = {
  cs: {
    slug: 'pravidla', lang: 'cs', locale: 'cs_CZ',
    title: 'Pravidla brazilské kanasty (canastra) – hraj online zdarma | Canastra família Bona',
    desc: 'Pravidla brazilské kanasty (canastry) srozumitelně: vykládání, canasty, žolíci, odhazovací hromádka, černé a červené trojky, bodování. Zahraj si zdarma online proti robotům nebo s přáteli.',
    h1: 'Pravidla brazilské kanasty (canastra)',
    lead: 'Canastra família Bona je brazilská kanasta, jak ji hraje naše rodina. Hraje se se dvěma balíčky karet, cílem je stavět postupky a canasty a jako první dosáhnout 4 000 bodů. Níže najdeš celá pravidla, podle kterých hra běží, a hned si je můžeš vyzkoušet: zdarma v prohlížeči, proti robotům nebo online s přáteli.',
    cta: 'Hrát zdarma',
    features_h: 'Co hra umí',
    features: ['Hra proti robotům ve třech obtížnostech, i bez internetu', 'Online hra s přáteli 1 na 1 i 2 na 2, pozvánky, chat a smajlíci', 'Výuka pro začátečníky s nápovědou ke každému tahu', 'Profily, statistiky, trofeje a žebříček', 'Instalace jako aplikace do mobilu (Android, iPhone) i do počítače', 'Čeština, angličtina a portugalština, bez reklam a zdarma'],
    faq_h: 'Časté otázky',
    faq: [
      ['Kolik hráčů hraje kanastu?', 'Dva hráči proti sobě, nebo čtyři hráči ve dvou týmech. V naší hře můžeš místo kohokoli posadit robota.'],
      ['Kolik karet se rozdává a s čím se hraje?', 'Hraje se se dvěma balíčky po 52 kartách a čtyřmi jokery (108 karet), každý hráč dostane 13 karet.'],
      ['Jak se v kanastě vyhrává?', 'Body se sčítají po každém kole: karty na stole, canasty, červené trojky a karty v ruce soupeře pro toho, kdo zavře. Hra končí, když někdo dosáhne 4 000 bodů.'],
      ['Je hra zdarma?', 'Ano, celá hra je zdarma a bez reklam. Pro hru s přáteli stačí založit účet se jménem a heslem.'],
    ],
    back: 'Zpět do hry', other: 'Další jazyky',
  },
  en: {
    slug: 'rules', lang: 'en', locale: 'en_US',
    title: 'Brazilian Canasta (Canastra) Rules – play free online | Canastra família Bona',
    desc: 'Brazilian canasta (canastra) rules explained: melds, canastas, wild cards, the discard pile, black and red threes and scoring. Play free online against bots or with friends.',
    h1: 'Brazilian canasta (canastra) rules',
    lead: 'Canastra família Bona is Brazilian canasta the way our family plays it. Two decks, runs and canastas, and the first side to 4,000 points wins. Below are the full rules the game uses, and you can try them right away: free in your browser, against bots or online with friends.',
    cta: 'Play for free',
    features_h: 'What the game offers',
    features: ['Play against bots at three difficulty levels, even offline', 'Online games with friends, 1 vs 1 and 2 vs 2, invites, chat and emotes', 'Beginner tutorial with tips for every move', 'Profiles, stats, trophies and a leaderboard', 'Installs as an app on phones (Android, iPhone) and computers', 'Czech, English and Portuguese, free and without ads'],
    faq_h: 'FAQ',
    faq: [
      ['How many players play canasta?', 'Two players head to head, or four players in two teams. In our game any seat can be taken by a bot.'],
      ['How many cards are used?', 'Two 52-card decks plus four jokers (108 cards). Each player gets 13 cards.'],
      ['How do you win at canasta?', 'Points are added after every round: cards on the table, canastas, red threes and, for whoever goes out, the cards left in the opponents’ hands. The game ends when someone reaches 4,000 points.'],
      ['Is the game free?', 'Yes, it is completely free and ad-free. To play with friends you just create an account with a name and password.'],
    ],
    back: 'Back to the game', other: 'Other languages',
  },
  pt: {
    slug: 'regras', lang: 'pt-BR', locale: 'pt_BR',
    title: 'Regras da Canastra – jogue grátis online | Canastra família Bona',
    desc: 'Regras da canastra explicadas: jogos, canastras, curingas, o lixo, três pretos e vermelhos e a contagem de pontos. Jogue grátis online contra robôs ou com amigos.',
    h1: 'Regras da canastra',
    lead: 'Canastra família Bona é a canastra do jeito que a nossa família joga. Dois baralhos, sequências e canastras, e vence quem chegar primeiro a 4.000 pontos. Abaixo estão as regras completas do jogo, e você pode experimentá-las agora mesmo: grátis no navegador, contra robôs ou online com amigos.',
    cta: 'Jogar grátis',
    features_h: 'O que o jogo oferece',
    features: ['Jogue contra robôs em três níveis, até sem internet', 'Partidas online com amigos, 1 contra 1 e 2 contra 2, convites, chat e emojis', 'Tutorial para iniciantes com dicas a cada jogada', 'Perfis, estatísticas, troféus e ranking', 'Instala como aplicativo no celular (Android, iPhone) e no computador', 'Tcheco, inglês e português, grátis e sem anúncios'],
    faq_h: 'Perguntas frequentes',
    faq: [
      ['Quantas pessoas jogam canastra?', 'Duas pessoas, uma contra a outra, ou quatro em duas duplas. No nosso jogo qualquer lugar pode ser de um robô.'],
      ['Quantas cartas são usadas?', 'Dois baralhos de 52 cartas e quatro coringas (108 cartas). Cada jogador recebe 13 cartas.'],
      ['Como se ganha na canastra?', 'Os pontos somam depois de cada rodada: cartas na mesa, canastras, três vermelhos e, para quem bate, as cartas que ficaram na mão dos adversários. O jogo acaba quando alguém chega a 4.000 pontos.'],
      ['O jogo é grátis?', 'Sim, é totalmente grátis e sem anúncios. Para jogar com amigos basta criar uma conta com nome e senha.'],
    ],
    back: 'Voltar ao jogo', other: 'Outros idiomas',
  },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (p) => `${SITE}/${p.slug}/`;

function page(key) {
  const p = PAGES[key];
  const rules = D[key].rules_html.replace(/<h2>[^<]*<\/h2>/, '').trim();
  const alt = Object.values(PAGES).map((q) => `<link rel="alternate" hreflang="${q.lang}" href="${url(q)}">`).join('\n');
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Canastra família Bona', url: SITE + '/', applicationCategory: 'GameApplication', operatingSystem: 'Web, Android, iOS, Windows', inLanguage: ['cs', 'en', 'pt-BR'], offers: { '@type': 'Offer', price: '0', priceCurrency: 'CZK' }, description: p.desc },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const others = Object.values(PAGES).filter((q) => q !== p).map((q) => `<a href="/${q.slug}/" hreflang="${q.lang}">${esc(q.h1)}</a>`).join(' · ');
  return `<!DOCTYPE html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url(p)}">
${alt}
<link rel="alternate" hreflang="x-default" href="${url(PAGES.cs)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Canastra família Bona">
<meta property="og:title" content="${esc(p.h1)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url(p)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="${p.locale}">
<meta name="theme-color" content="#0d3833">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0d3833 radial-gradient(ellipse at top, #175a51, #0d3833 60%); color: #f3ead6; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
header img { width: 44px; height: 44px; border-radius: 10px; }
header a { color: #f3ead6; text-decoration: none; font-weight: 700; }
h1 { font: 700 34px/1.2 Georgia, "Times New Roman", serif; margin: 18px 0 10px; }
h2 { font: 700 24px/1.3 Georgia, serif; margin: 34px 0 8px; color: #f1c34c; }
h3 { margin: 24px 0 6px; font-size: 19px; color: #f1c34c; }
p.lead { font-size: 19px; color: #e3dcc8; }
.cta { display: inline-block; margin: 14px 0 6px; padding: 14px 26px; border-radius: 14px; background: #f1c34c; color: #1d1a10; font-weight: 800; text-decoration: none; font-size: 18px; }
.rules { background: rgba(0,0,0,.18); border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 4px 22px 18px; }
li { margin: 4px 0; }
.faq dt { font-weight: 700; margin-top: 14px; }
.faq dd { margin: 4px 0 0; color: #e3dcc8; }
footer { margin-top: 40px; font-size: 15px; color: #b9c9c3; }
footer a, .langs a { color: #f1c34c; }
.langs { font-size: 15px; margin-top: 6px; }
</style>
</head>
<body>
<main>
<header><img src="/icons/icon-192.png" alt="" width="44" height="44"><a href="/">Canastra família Bona</a></header>
<h1>${esc(p.h1)}</h1>
<p class="lead">${esc(p.lead)}</p>
<a class="cta" href="/">▶ ${esc(p.cta)}</a>
<p class="langs">${esc(p.other)}: ${others}</p>
<section class="rules">
${rules}
</section>
<h2>${esc(p.features_h)}</h2>
<ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<a class="cta" href="/">▶ ${esc(p.cta)}</a>
<h2>${esc(p.faq_h)}</h2>
<dl class="faq">${p.faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>
<footer><a href="/">${esc(p.back)}</a> · canastra-familia-bona.faldik2033.workers.dev</footer>
</main>
</body>
</html>
`;
}

for (const key of Object.keys(PAGES)) {
  const dir = path.join(PUB, PAGES[key].slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(key));
}
const urls = [{ loc: SITE + '/', pr: '1.0' }].concat(Object.values(PAGES).map((p) => ({ loc: url(p), pr: '0.8' })));
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${u.pr}</priority></url>`).join('\n')}
</urlset>
`);
console.log('SEO stránky:', Object.values(PAGES).map((p) => '/' + p.slug + '/').join(' '));
