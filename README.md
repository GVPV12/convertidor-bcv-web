<img width="1920" height="914" alt="2bd2r7p213xh1" src="https://github.com/user-attachments/assets/426bc241-9936-467a-8ce9-c72dc40c2719" />


# 💱 Convertidor BCV (web)

**Español** | [English](README.en.md)

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
- 💾 Todas las opciones se recuerdan al volver a la página
- 📴 Si no hay conexión, muestra la última tasa guardada
- 📱 100% responsivo: se adapta a cualquier dispositivo (teléfono, tablet, laptop y monitores grandes)

## Uso

🌐 **En línea:** [usdbcv.netlify.app](https://usdbcv.netlify.app/)

No necesita instalación ni compilación: también puedes abrir `index.html` en el navegador.
Está publicada en **Netlify**, que vuelve a publicar la web con cada commit en `main`.

> 🔖 **Tip:** guárdala en tus marcadores (o en la pantalla de inicio de tu teléfono) y ábrela cada vez que necesites convertir. Funciona igual de bien en cualquier dispositivo.

## Fuentes de datos

| Dato | Fuente |
|---|---|
| Tasa de hoy (USD y EUR) | Leída directamente de la portada de [bcv.org.ve](https://www.bcv.org.ve/), con su **fecha valor** |
| Histórico de la gráfica | [DolarApi Venezuela](https://dolarapi.com/docs/venezuela/) |
| Respaldo de la tasa | DolarApi, y si no hay conexión, la última tasa guardada en el navegador |

Cómo se mantiene al día:

1. Cada 30 minutos, la GitHub Action [`update-rates.yml`](.github/workflows/update-rates.yml) ejecuta `scripts/update-rates.mjs`, que lee la web del BCV.
2. Si la tasa o la fecha valor cambiaron, guarda `rates.json` y hace un commit; Netlify publica ese cambio solo.
3. La web lee `rates.json` y DolarApi a la vez y muestra la tasa más reciente. Así aparece la tasa nueva en cuanto el BCV la publica por la tarde.

El script rechaza cualquier tasa que salte más de un 25 % respecto a la anterior. La Action también se puede ejecutar a mano desde la pestaña **Actions** → **Actualizar tasa BCV** → **Run workflow**.

## Tecnología

- HTML, CSS y JavaScript sin frameworks de compilación
- [Tailwind CSS](https://tailwindcss.com/) (CDN) para el layout
- GitHub Actions + Node 20 (sin dependencias) para leer la tasa del BCV

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos, efectos "liquid glass" y skins |
| `app.js` | Lógica: tasas, conversión, gráfica, opciones |
| `i18n.js` | Textos en español e inglés |
| `quotes.js` | Frases motivacionales |
| `rates.json` | Última tasa del BCV (la genera la Action, no se edita a mano) |
| `scripts/update-rates.mjs` | Lee la tasa de bcv.org.ve y actualiza `rates.json` |
| `.github/workflows/update-rates.yml` | Ejecuta el script cada 30 minutos |
