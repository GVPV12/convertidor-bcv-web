# 💱 Convertidor BCV (web)

Versión web del [Convertidor de Moneda](https://github.com/GVPV12/usdtoves) original en Python/Kivy.
Convierte **dólares (USD)** y **euros (EUR)** a **bolívares (VES)** y viceversa con la tasa oficial del **Banco Central de Venezuela**.

## Funciones

- 🔄 Conversión USD/EUR → Bs y Bs → USD/EUR, en vivo mientras escribes
- 📊 Tasa BCV de hoy con gráfica histórica (7, 30 y 90 días) y variación porcentual
- 💶 Botón para cambiar entre dólar y euro
- 💬 Frase motivacional del día (36 frases, en español e inglés)
- 🌐 Idioma español / inglés
- 🎨 3 skins: **Fluido**, **Holograma** y **Esmeralda**, con opción de rotarlas automáticamente o elegir una al azar al iniciar
- 👁️ Vista simple: solo el precio, sin gráfica ni porcentaje
- 📴 Si no hay conexión, muestra la última tasa guardada
- 📱 Diseño responsivo (móvil, tablet y laptop)

## Uso

No necesita instalación ni compilación: abre `index.html` en el navegador.
También se puede publicar tal cual con **GitHub Pages** (Settings → Pages → rama `main`, carpeta `/ (root)`).

## Tecnología

- HTML, CSS y JavaScript sin frameworks de compilación
- [Tailwind CSS](https://tailwindcss.com/) (CDN) para el layout
- [DolarApi Venezuela](https://dolarapi.com/docs/venezuela/) para las tasas oficiales del BCV (dólar y euro, actual e histórico)

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos, efectos "liquid glass" y skins |
| `app.js` | Lógica: tasas, conversión, gráfica, opciones |
| `i18n.js` | Textos en español e inglés |
| `quotes.js` | Frases motivacionales |

> Los valores son referenciales. La tasa proviene del BCV a través de DolarApi.
