# Capricorn

Mascota virtual de escritorio para Windows, inspirada en **Capri** de *Cyberpunk: Edgerunners 2*.
Vive encima de tus ventanas: camina por la barra de tareas, vuela, se sienta, duerme, voltea a ver
tu cursor y te habla cuando interactúas con ella.

> Proyecto de fans sin fines de lucro. No está afiliado a CD Projekt Red, Studio Trigger ni Netflix.

## Qué hace

- **Animación por cuadros** desde un spritesheet: parada, caminando, sentada, durmiendo y salto.
- **Te mira:** cuando el cursor se acerca, gira el cuerpo hacia él (de frente a perfil).
- **Vida propia:** cada pocos segundos decide qué hacer (caminar, volar, sentarse, bailar, mirar
  el cielo, teletransportarse, hacer glitch, decir algo...). Si no la tocas en un rato, se duerme.
- **Interacción:**
  | Acción | Reacción |
  |---|---|
  | Clic | Te dice algo (o salta de gusto) |
  | Pasar el cursor rápido por su cabeza | Caricia: se pone contenta |
  | Arrastrar | La cargas; si la sacudes se marea y si la lanzas rebota en los bordes |
  | Doble clic | Da una vuelta |
  | Clic derecho (o el ícono junto al reloj) | Menú: hablar, bailar, dormir, seguir el cursor, tamaño, salir |
- Fuera de ella los clics pasan a tus ventanas normalmente: no estorba.

## Requisitos

- Windows 10/11
- [Node.js](https://nodejs.org/) 18 o superior

## Instalación

```bash
git clone <url-de-tu-repo>
cd capricorn
npm install
```

Si al abrir aparece un error de que falta `electron.exe`, descarga el binario manualmente:

```bash
node node_modules/electron/install.js
```

## Uso

```bash
npm start
```

O doble clic en **`Iniciar Capri.vbs`**, que la abre sin mostrar una consola.

### Que arranque con Windows

1. Presiona `Win + R`, escribe `shell:startup` y Enter.
2. Crea ahí un acceso directo a `Iniciar Capri.vbs`.

Para quitarlo, borra ese acceso directo.

## Personalizar

- **Frases:** edita [`lines.js`](lines.js). Cada categoría (`click`, `pet`, `sleep`, `sky`, ...) es
  una lista; agrega o cambia las que quieras.
- **Tamaño:** clic derecho → Tamaño (se recuerda entre sesiones).
- **Modo demo** (para revisar animaciones en un solo lugar): `npm run demo`.

Después de editar, ciérrala (clic derecho → Salir) y ábrela de nuevo.

## Estructura

```
main.js          Ventana transparente a pantalla completa, siempre encima, click-through,
                 ícono en la bandeja y menú.
preload.js       Puente seguro entre la ventana y main.js.
renderer.js      Cerebro (comportamientos), animación, física, partículas y globo de texto.
lines.js         Diálogos.
index.html       Página que carga todo.
assets/
  sheet_src.jpg  Spritesheet original.
  atlas.png/.js  Cuadros recortados del spritesheet con sus anclas.
  atlas_hd.*     Los mismos cuadros al doble de resolución y con nitidez (los que usa la app).
tools_slice.py   Corta el spritesheet en cuadros  -> atlas.png / atlas.js
tools_enhance.py Mejora resolución y nitidez      -> atlas_hd.png / atlas_hd.js
```

## Regenerar los sprites

Solo si cambias el spritesheet. Requiere Python 3:

```bash
pip install -r requirements.txt
python tools_slice.py assets/sheet_src.jpg assets
python tools_enhance.py apply
```

`tools_slice.py` espera la misma distribución de filas que `assets/sheet_src.jpg`
(parada, caminando, sentada, durmiendo, salto) sobre fondo gris liso.
