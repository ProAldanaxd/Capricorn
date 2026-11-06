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

## IA (Gemini)

Capri puede pensar con **Gemini** (Google AI Studio). Con la IA activa:

- **Platica de verdad** y entiende cualquier forma de pedirle las cosas.
- **Usa sus poderes como herramientas** (abrir apps, música, buscar, capturas, ordenar Descargas...).
- **Comenta lo que pasa** (apps, juegos, clima, hora, batería...) con frases generadas, no fijas.
- **Recuerda cosas de ti** a largo plazo (memoria local, una cosa por línea).

Configúrala desde el clic derecho → **API Keys**:

| Opción | Qué hace |
|---|---|
| **Configurar API de Gemini…** | Pegas tu clave de [Google AI Studio](https://aistudio.google.com/apikey). Se guarda **cifrada** con Windows en la carpeta de datos de la app; nunca en el proyecto |
| **IA activada (Gemini)** | Prende/apaga Gemini (se recuerda entre sesiones) |
| **Ollama (IA local, gratis)** | Usa [Ollama](https://ollama.com) en tu compu para los comentarios espontáneos y como plática de respaldo. Capri lo enciende sola y le pide soltar la tarjeta de video cuando abres un juego |

Y en **Memoria**: *Ver lo que recuerda* (un `.txt` editable) y *Olvidar esta conversación*.

**Quién hace qué:**
- Plática y herramientas (abrir, buscar, música...) → **Gemini**.
- Comentarios espontáneos (apps, clima, clics...) → **Ollama** (gratis); si no está, Gemini.
- Si Gemini se queda sin cuota → las órdenes las atienden sus reglas y la plática **Ollama**.

En el globo: **SYNC** = Gemini, **OLLAMA** = IA local, **LOCAL** = reglas y frases fijas.

**Qué se envía a Google:** lo que le escribes, su memoria, el contexto (hora, clima, app abierta, batería) y los
resultados de las herramientas que use. En el plan gratuito de AI Studio, Google puede usar esos datos para
mejorar sus productos.

### Ejecutar comandos 🔒

La IA puede **proponer** comandos de PowerShell, pero viene bloqueado: pon `"desbloquearComandos": true` en
`config.json`. Aun así, **cada comando** se muestra completo en una ventana y solo corre si le das *Ejecutar*
(sin administrador, máximo 30 s). Todo queda registrado en `comandos.log` en la carpeta de datos de la app.

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

### Pasarle cosas a Claude

Desde la misma barra, Capri le pasa tu texto a la app de escritorio de **Claude**: la abre si
está cerrada o la trae al frente si ya está abierta, lo escribe en una conversación nueva y
le da Enter por ti.

| Cómo | A dónde va |
|---|---|
| **Tab** en la barra: `CAPRI` (rosa) → `CAPRI` (naranja, va a Claude) → `CAPRI CODE` (naranja, va a Claude Code) | Al modo elegido |
| `@claude explícame los hooks` | Chat nuevo de Claude |
| `@code revisa el README` | Sesión nueva de Claude Code |
| `dile a Claude que…`, `pregúntale a Claude Code…` | Igual que arriba, en español |

- **Sigue en la misma conversación.** El primer mensaje abre un chat (o sesión de Code) nuevo;
  los siguientes van a esa misma conversación hasta que pidas otra o cierres a Capri.
  - Para empezar otra: escribe `nuevo` en modo CAPRI naranja / CAPRI CODE (o `@claude nuevo`,
    `@code nueva sesión: …`), o clic derecho → **Claude** → *Chat nuevo* / *Sesión nueva*.
  - En el chat, Capri pega en **el chat que tengas abierto**. En Claude Code regresa a la sesión
    correcta aunque te hayas ido a otra.
  - Para seguir, Capri pega con el portapapeles y luego te deja el texto que tenías copiado
    (si tenías una imagen copiada, se reemplaza). Si no pudo pegar, el texto se queda
    copiado para que lo pegues tú.
  - Cada envío queda anotado (sin tu texto) en `%APPDATA%\capricorn\claude.log`.
- **Elegir sesión de Claude Code:** clic derecho → **Claude** → *Sesiones de Claude Code* muestra
  las 10 más recientes; la que elijas recibe lo que mandes en CAPRI CODE.
- Capri solo presiona teclas si la ventana del frente es Claude; si no, te avisa.

### Pasarle cosas a Antigravity

Igual que con Claude, pero con la app de escritorio de **Antigravity**:

| Cómo | Qué hace |
|---|---|
| **Tab** hasta `CAPRI AG://` (azul) | Lo que escribas va a Antigravity |
| `@ag revisa el login`, `dile a Antigravity que…` | Lo mismo sin cambiar de modo |
| `nuevo` en modo CAPRI AG, `@ag nuevo`, o clic derecho → **Antigravity** → *Conversación nueva* | La próxima vez abre una conversación nueva |
| Clic derecho → **Antigravity** → *Conversaciones* | Elegir una conversación guardada (las 10 más recientes) |

- Abre Antigravity si está cerrada o la trae al frente, presiona su botón *New Conversation*
  cuando toca, pega tu texto en *Message input* y presiona *Send message*.
- Sigue en la misma conversación hasta que pidas una nueva o cierres a Capri.
- **Ventanas** también la minimiza después de enviar.
- Las conversaciones las lee (solo lectura) de `%USERPROFILE%\.gemini\antigravity\conversation_summaries.db`.
- Clic derecho → **Ventanas** (apagado por defecto): después de enviarlo, Capri minimiza la
  ventana de Claude para que sigas en lo tuyo. Solo la minimiza si ella le dio Enter.
- `claudeDarEnter: false` en `config.json` para que solo lo deje escrito.
- `carpetaClaudeCode` fija la carpeta del proyecto para Claude Code (vacío = la que elija la app).
- Si Claude estaba cerrada espera unos segundos más a que cargue antes del Enter.

### Pasarles imágenes

En los modos `CAPRI` naranja, `CAPRI CODE` y `CAPRI AG` puedes mandar imágenes junto con tu
mensaje (o solas):

1. Toma una captura (`Win+Shift+S`) o copia una imagen.
2. Abre el cuadro (`Ctrl+Alt+C`) y pégala con **Ctrl+V**: sale una miniatura (✕ para quitarla).
   Hasta 4 por mensaje.
   - Si copiaste una imagen hace menos de un minuto, Capri te ofrece *"📎 Tienes una captura
     de hace X s · clic para adjuntarla"* para no tener que pegarla.
3. Escribe tu pregunta (o nada) y Enter: Capri pega las imágenes en la caja de la app, una por
   una, luego tu texto, y lo envía como **un solo mensaje**.

- En modo `CAPRI` (rosa) las imágenes no se mandan: Capri te pide que cambies de modo con Tab.
- Capri no "ve" la imagen (su IA no la recibe); solo se la pasa a Claude o a Antigravity.
- Usa el portapapeles: al final te regresa el **texto** que tenías copiado, pero no una imagen.
- Las imágenes se guardan un momento en la carpeta temporal de Windows y se borran solas.
- Lo de "captura reciente" usa el vigilante de apps (`reaccionarAApps`): solo detecta *que* se
  copió una imagen, no la lee hasta que le das clic.

### Permisos y preguntas de Claude Code

Cuando Claude Code te pide **permiso** para usar una herramienta, te hace una **pregunta** con
opciones o te deja **botones de respuesta** (como "Sí, hazlo"), Capri te lo enseña con botones:

- **Permisos:** Permitir (solo esa vez), Negar o En Claude (que salga la ventanita normal).
- **Preguntas:** picas la opción (o varias y "Listo"). Para escribir otra respuesta, En Claude.
- **Botones de respuesta:** Capri le manda ese texto a la sesión, igual que si lo escribieras.
- Si no contestas en ~100 s, o si estás viendo Claude en ese momento, todo sigue en Claude como siempre.
- Capri **nunca** aprueba nada sola: solo pasa tu clic.

Funciona con hooks de Claude Code en `%USERPROFILE%\.claude\settings.json` (`PermissionRequest`,
`PreToolUse` y `Stop`), que corren [`hooks/capri-hook.js`](hooks/capri-hook.js). Ese script habla
con Capri por un servidor local (solo `127.0.0.1`, con un token en `%APPDATA%\capricorn\hooks.json`).
Si Capri está cerrada no hace nada. Para quitarlo, borra la sección `"hooks"` de ese `settings.json`
(hay una copia de antes en `settings.json.antes-de-capri.bak`). Lo que pasa queda en `claude.log`.

### Permisos de Antigravity

Lo mismo con la app de Antigravity, con hooks en `%USERPROFILE%\.gemini\config\hooks.json`
(también se ven en Settings > Customizations > Hooks; el hook se llama `capri`):

- **Comandos y escribir/editar archivos:** Permitir, Negar o En Antigravity. Leer y buscar pasan
  directo. Ojo: Capri pregunta por *cada* comando, aunque Antigravity lo fuera a correr solo.
- **Preguntas** de Antigravity: Capri te avisa y te enseña la pregunta, pero se contesta en
  Antigravity (botón "Ir a Antigravity").
- **Cuando acaba**, si no lo estás viendo, Capri te dice "Antigravity ya acabó".
- Si no contestas en ~90 s, si estás viendo Antigravity o si Capri está cerrada, sigue como siempre.
- Para quitarlo, borra ese `hooks.json` (o apaga el hook `capri` en Settings).

### Qué están haciendo

Mientras Claude Code o Antigravity trabajan, debajo de Capri sale una línea por app con lo último
que hicieron: *CLAUDE · Capri › editando main.js*, *AG · Mi web › leyendo config.json*… Se quita
cuando terminan (o tras 90 s sin noticias). Sale de los mismos hooks.

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
| `ia` | Si la IA arranca activada la primera vez (luego manda el menú) |
| `modeloIA` | Modelo de Gemini (por defecto `gemini-3.6-flash`; si no existe usa `gemini-flash-latest`) |
| `comentariosIA` | `false` para que los comentarios espontáneos sean frases fijas |
| `segundosEntreComentariosIA` | Mínimo de segundos entre comentarios espontáneos con IA (por defecto 150) |
| `desbloquearComandos` | `true` para que la IA pueda proponer comandos (siempre con confirmación) |
| `ollama` | Si Ollama arranca activado la primera vez (luego manda el menú) |
| `modeloOllama` | Modelo local (por defecto `llama3.2:3b`) |
| `segundosEntreComentariosOllama` | Mínimo de segundos entre comentarios con Ollama (por defecto 60) |
| `claudeDarEnter` | `false` para que Capri solo deje el texto escrito en Claude, sin enviarlo |
| `carpetaClaudeCode` | Carpeta del proyecto para las sesiones de Claude Code (vacío = la de la app) |

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
ai.js            IA: clave cifrada, personalidad, herramientas, memoria y comandos con confirmación.
claude.js        Le pasa texto a la app de Claude (chat o Claude Code) y le da Enter.
antigravity.js   Lo mismo con la app de Antigravity (por sus botones, vía accesibilidad).
images.js        Imágenes pegadas en el cuadro: las guarda un momento y las pega en Claude/Antigravity.
hooks.js         Recibe permisos, preguntas y botones de Claude Code (servidor local).
hooks/           capri-hook.js: el script que corre Claude Code y le pasa todo a Capri.
prompts.js       El panel con botones para contestarle a Claude Code desde Capri.
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
