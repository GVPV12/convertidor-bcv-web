# 💱 Convertidor BCV (web)

Versión web del [Convertidor de Moneda](https://github.com/GVPV12/usdtoves) original en Python/Kivy.
Convierte **dólares (USD)** y **euros (EUR)** a **bolívares (VES)** y viceversa con la tasa oficial del **Banco Central de Venezuela**.

## Funciones

- 🔄 Conversión USD/EUR → Bs y Bs → USD/EUR, en vivo mientras escribes
- 📊 Tasa BCV de hoy con gráfica histórica (7, 30 y 90 días) y variación porcentual
- 💶 Botón para cambiar entre dólar y euro
- 💬 Una frase de esperanza y motivación distinta en cada visita (38 frases, en español e inglés)
- 🌐 Idioma español / inglés
- 🎨 3 skins: **Fluido**, **Holograma** y **Esmeralda**, con opción de rotarlas automáticamente o elegir una al azar al iniciar
- 👁️ Vista simple: solo el precio, sin gráfica ni porcentaje
- ✅ Botón opcional **Verificar** que lleva a la página oficial del BCV
- 🌍 Opción para mostrar las demás monedas oficiales del BCV: **yuan, lira turca y rublo**
- 💾 Todas las opciones se recuerdan al volver a la página
- 📴 Si no hay conexión, muestra la última tasa guardada
- 📱 100% responsivo: se adapta a cualquier dispositivo (teléfono, tablet, laptop y monitores grandes)

## Uso

No necesita instalación ni compilación: abre `index.html` en el navegador.

> 🔖 **Tip:** guárdala en tus marcadores (o en la pantalla de inicio de tu teléfono) y ábrela cada vez que necesites convertir. Funciona igual de bien en cualquier dispositivo.
También se puede publicar tal cual con **GitHub Pages** (Settings → Pages → rama `main`, carpeta `/ (root)`).

## Tecnología

- HTML, CSS y JavaScript sin frameworks de compilación
- [Tailwind CSS](https://tailwindcss.com/) (CDN) para el layout
- [DolarApi Venezuela](https://dolarapi.com/docs/venezuela/) para las tasas oficiales del BCV (dólar y euro, actual e histórico)
- [BCV Today](https://bcv.today/en/api/) para yuan, lira turca y rublo (y como respaldo de dólar y euro)

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos, efectos "liquid glass" y skins |
| `app.js` | Lógica: tasas, conversión, gráfica, opciones |
| `i18n.js` | Textos en español e inglés |
| `quotes.js` | Frases motivacionales |

> Los valores son referenciales. La tasa proviene del BCV a través de DolarApi.
