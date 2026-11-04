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
- **Sabe qué estás usando** (Opera GX, VS Code, Discord, Steam, Epic, Outlook, Explorador,
  Configuración...) y lo comenta. Detecta tus juegos de **Steam y Epic** automáticamente: dice algo
  al abrirlos, **se esconde mientras juegas** y vuelve al salir.
- **AFK:** si dejas la compu, se duerme; cuando regresas, te recibe.
- **Descansos:** tras 2 horas seguidas frente a la pantalla te recuerda estirarte o tomar agua.
- **Hora del día:** desayuno, comida, cena, desveladas y fines de semana.
- **Clima real** de tu ciudad (vía [Open-Meteo](https://open-meteo.com/), sin clave): lo comenta,
  y si llueve le caen gotitas digitales; con tormenta se asusta de los truenos.

La detección de apps es local: solo se lee el nombre del programa en primer plano y nada sale
de tu compu. Lo único que usa internet es el clima (se envía la latitud/longitud de `config.json`).

## Pedirle cosas

Presiona **`Ctrl + Alt + C`** (o clic derecho → *Pedirle algo…*) y escribe lo que quieres:

| Escribe | Qué hace |
|---|---|
| `abre cyberpunk`, `abre discord`, `abre descargas` | Abre juegos (Steam/Epic), apps del menú Inicio y carpetas |
| `pausa`, `siguiente`, `anterior`, `sube el volumen`, `silencio` | Controla la música y el volumen |
| `busca tarea final` | Busca en Escritorio, Documentos, Descargas, Imágenes, OneDrive... y abre la carpeta |
| `toma una captura` | Guarda una captura en *Imágenes › Capri* |
| `ordena descargas` / `deshaz el orden` | Ordena Descargas en subcarpetas por tipo (pide confirmación; se puede deshacer) |
| `batería`, `cuánto espacio tengo`, `cómo está la compu`, `clima` | Te dice el estado |
| `ayuda` | Lista lo que sabe hacer |

También te avisa sola: batería baja, CPU o RAM al tope, poco espacio en disco, descargas
terminadas y USB conectadas.

### Acciones bloqueadas

Estas existen pero vienen **bloqueadas**. Para usarlas pon `"desbloquearAccionesPeligrosas": true`
en `config.json`; aun así, **cada una pide confirmación** en una ventana de Windows:

| Escribe | Qué hace |
|---|---|
| `borra notas viejas` | Manda el archivo a la **Papelera** (nunca borra para siempre) |
| `modo oscuro` / `modo claro` / `brillo 60` | Cambia el tema de Windows o el brillo |
| `instala vlc` | Abre una terminal con `winget install` para que veas qué se instala |

## Configuración

Edita [`config.json`](config.json) y reinicia Capri:

| Campo | Qué hace |
|---|---|
| `ciudad`, `latitud`, `longitud`, `zonaHoraria` | Ubicación para el clima |
| `clima` | `false` para desactivar el clima |
| `reaccionarAApps` | `false` para que no vigile qué app usas |
| `esconderseEnJuegos` | `false` para que se quede visible mientras juegas |
| `minutosParaRecordarDescanso` | Cada cuánto te recuerda descansar (por defecto 120) |
| `minutosAFKParaDormir` | Minutos sin actividad para que se duerma (por defecto 5) |
| `avisos` | `false` para apagar los avisos de batería, CPU, disco, descargas y USB |
| `atajoPedirleAlgo` | Atajo de teclado para pedirle cosas (por defecto `Ctrl+Alt+C`) |
| `desbloquearAccionesPeligrosas` | `true` para permitir papelera, tema/brillo e instalar (siempre con confirmación) |

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
lines.js         Diálogos (incluye los de apps, juegos, hora y clima).
env.js           Reacciones al entorno: apps, juegos, AFK, descansos, hora y clima.
apps.js          Detecta la app en primer plano y los juegos instalados (Steam/Epic).
watcher.ps1      Pequeño script que reporta la ventana activa a apps.js.
commands.js      Cuadro "Pedirle algo", intérprete de órdenes y avisos.
powers.js        Las acciones (abrir, música, buscar, capturas, ordenar, bloqueadas) y los avisos.
config.json      Ciudad y opciones.
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
