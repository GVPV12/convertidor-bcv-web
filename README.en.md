# 💱 BCV Converter (web)

[Español](README.md) | **English**

Web version of the original Python/Kivy [Currency Converter](https://github.com/GVPV12/usdtoves).
Converts **US dollars (USD)** and **euros (EUR)** to **Venezuelan bolívars (VES)** and back, using the official rate from the **Central Bank of Venezuela (BCV)**.

## Features

- 🔄 USD/EUR → Bs and Bs → USD/EUR conversion, live as you type
- 📊 Today's BCV rate with a historical chart (7, 30 and 90 days) and percentage change
- 💶 Button to switch between dollar and euro
- 💬 A different quote of hope and motivation on every visit (38 quotes, in Spanish and English)
- 🌐 Spanish / English language
- 🎨 3 skins: **Fluid**, **Hologram** and **Emerald**, with options to rotate them automatically or pick a random one on start
- 👁️ Simple view: price only, no chart or percentage
- ✅ Optional **Verify** button linking to the official BCV website
- 💾 All settings are remembered when you come back
- 📴 When offline, it shows the last saved rate
- 📱 100% responsive: works on any device (phone, tablet, laptop and large monitors)

## Usage

No installation or build step: just open `index.html` in your browser.
It can also be published as-is with **GitHub Pages** (Settings → Pages → branch `main`, folder `/ (root)`).

> 🔖 **Tip:** save it to your bookmarks (or your phone's home screen) and open it whenever you need to convert. It works just as well on any device.

## Tech

- Plain HTML, CSS and JavaScript, no build tools
- [Tailwind CSS](https://tailwindcss.com/) (CDN) for layout
- Today's rate read straight from [bcv.org.ve](https://www.bcv.org.ve/) every 30 minutes by a GitHub Action (`scripts/update-rates.mjs` → `rates.json`)
- [DolarApi Venezuela](https://dolarapi.com/docs/venezuela/) for the chart history and as a fallback rate
## Files

| File | Contents |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Styles, "liquid glass" effects and skins |
| `app.js` | Logic: rates, conversion, chart, settings |
| `i18n.js` | Spanish and English texts |
| `quotes.js` | Motivational quotes |
