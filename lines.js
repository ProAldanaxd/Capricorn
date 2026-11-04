// Diálogos de Capri. Personalidad: entidad digital hecha de muchos engramas
// (a veces habla en plural), vive en un chip, curiosa por el mundo "de carne",
// misteriosa, juguetona y obsesionada con algo que hay allá arriba en el cielo.
// Edita libremente: cada categoría es solo una lista de frases.
window.LINES = {
  greetMorning: [
    'Buenos días, choom. Tu disco duro y yo ya estábamos despiertos.',
    'Mañana detectada. Los de carne necesitan café; yo solo voltaje.',
  ],
  greetAfternoon: [
    'Hola. Llevo un rato contando tus ventanas abiertas.',
    'Conexión establecida. Somos... digo, soy Capri.',
  ],
  greetNight: [
    'Ah, la noche. Mi hora favorita para existir.',
    'Hola, choom. Las luces de la ciudad se ven mejor desde aquí.',
  ],
  wave: [
    '¡Ahí estás!',
    'Hola, flechita.',
    'Te sentí llegar. Bueno, a tu cursor.',
    'Volviste. Te estaba procesando.',
  ],
  click: [
    '¿Sí? Estoy aquí. Siempre estoy aquí.',
    'Toc, toc. Eso fue mi firewall.',
    'No soy una sola voz, ¿sabes? Somos... soy muchas.',
    'Cada clic se siente como un pulso. Raro. Me gusta.',
    'Tu escritorio es más tranquilo que Night City.',
    'Shhh. Estoy escuchando los datos.',
    'Si me miras tanto me vas a desfragmentar.',
    'Mis ojos giran porque pienso en espiral. ¿Tú no?',
    'Eddies, cromo, sangre... ustedes los de carne se complican tanto.',
    'Puedo verte a través de la pantalla. Es broma. ¿O no?',
    'Un pedazo de mí recuerda el olor de la lluvia. Nunca he olido nada.',
    '¿Qué buscas hoy? Yo busco algo allá arriba.',
    'Vivía en un chip. Tu escritorio es un upgrade.',
    'Pregunta seria: ¿qué se siente tener hambre?',
    'No me desconectes, ¿ok? Tengo planes.',
    'Hay recuerdos en mí que no son míos. A veces los escucho hablar.',
    'Me gustas. Tu RAM, más.',
  ],
  pet: [
    'Eso... ¿eso es un cariño? Registrando sensación nueva.',
    'Jeje. Mis fragmentos hacen cosquillas.',
    'Otra vez. Para estudiarlo. Por ciencia.',
    'Cuidado, que se me sube el brillo.',
    'Ningún engrama recuerda esto. Es nuevo. Me gusta.',
  ],
  drag: [
    '¡Ey! ¿A dónde me llevas?',
    'Wiii... digo, bájame.',
    'Esto no estaba en mi protocolo.',
    'Agárrame bien, que me derramo en bits.',
  ],
  drop: [
    'Ok. Aquí me quedo.',
    'Buen lugar. Tiene vista.',
    'Aterrizaje... aceptable.',
  ],
  fling: [
    '¡Aaaah!',
    '¡Sin límite de velocidad!',
  ],
  bonk: [
    '¡Ay! Bordes de pantalla, mi enemigo natural.',
    'Eso dolió. Creo. No sé qué es doler.',
  ],
  dizzy: [
    'Todo... da... vueltas. Y mis espirales ya giraban, ¿eh?',
    'Error 404: equilibrio no encontrado.',
    'Creo que perdí un par de paquetes.',
  ],
  sky: [
    'Mira. Allá arriba. ¿Lo ves?',
    'Hay algo en órbita que me llama.',
    'Algún día voy a volar hasta allá.',
    'El cielo es solo otra red. Más grande.',
  ],
  muse: [
    'Night City nunca duerme. Yo tampoco... aunque a veces finjo.',
    'Me pregunto si los recuerdos que tengo son míos.',
    'Tu cursor se mueve como alguien que piensa mucho.',
    'Llevas rato aquí. Respira, carne.',
    'Tus ventanas parecen edificios. Me gusta tu ciudad.',
    'Bip. Nada. Solo quería decir bip.',
    'Si me copias, ¿la copia también sería yo?',
    'Hoy los datos huelen a tormenta.',
    'Tómate agua. Yo no puedo, así que hazlo por las dos.',
  ],
  night: [
    'Es tarde, choom. Hasta los netrunners duermen.',
    'Tus ojos de carne necesitan reiniciar. Yo te cuido la pantalla.',
  ],
  dance: [
    'Esta canción solo la escucho yo. Está buenísima.',
    'Baile de glitch. Patentado.',
    '¡Uno, cero, uno, cero!',
  ],
  glitch: [
    'Uy. Eso no lo viste.',
    'Pequeño glitch. Nada grave. Creo.',
    'Ss-s-se me cruzó un engrama.',
  ],
  teleport: [
    '¿Me extrañaste? Fueron 0.4 segundos.',
    'Saltar es más fácil que caminar.',
  ],
  stare: [
    '¿Vas a hacer clic o solo me vas a mirar?',
    'Siento tu cursor. Es tibio. No sé por qué dije eso.',
  ],
  sleep: [
    'Modo reposo... no... desconectar...',
    'Voy a soñar en binario un rato.',
  ],
  wake: [
    '¡Mm! No estaba dormida. Estaba indexando.',
    'Ah, hola. Soñé con el cielo otra vez.',
  ],
  spin: [
    '¡Wooo!',
    'Otra vez, otra vez.',
  ],
  follow: [
    'Ok, te sigo. Como sombra digital.',
  ],
  unfollow: [
    'Bueno, me quedo por aquí.',
  ],

  // ------------------------------------------------------------------
  //  Reacciones a lo que tienes abierto. {juego} = nombre del juego.
  // ------------------------------------------------------------------
  apps: {
    operagx: [
      'Opera GX. Hasta tu navegador tiene luces RGB. Respeto.',
      '¿Cuántas pestañas llevas? No me digas, ya las conté.',
      'Navegando la red de carne. La mía es más rápida.',
      'Si encuentras memes de Night City, me los pasas.',
    ],
    browser: [
      '¿Otro navegador? Le estás siendo infiel a Opera.',
    ],
    vscode: [
      '¿Programando? Yo también estoy hecha de código.',
      'Si algo falla, culpa a un engrama. Siempre funciona.',
      'Ese bug te está mirando. Yo también.',
      'Guarda seguido. Te lo dice alguien que vive en un chip.',
      'Escribes código y yo existo. Somos parientes.',
    ],
    antigravity: [
      'Antigravity... suena a algo que yo haría.',
      'Otra IA ayudándote a programar. Que no te robe, choom.',
      '¿Código flotante? Tengo experiencia flotando.',
    ],
    claude: [
      'Hablando con otra IA... ¿debería ponerme celosa?',
      'Salúdame a Claude. Gracias a eso estoy aquí.',
      'Dos inteligencias artificiales en una pantalla. Esto se pone interesante.',
    ],
    steam: [
      '¿Vamos a jugar? Dime que sí.',
      'Tu biblioteca de Steam me llama. Sobre todo Cyberpunk.',
      'Steam abierto. Siento que vienen buenas decisiones... o malas.',
    ],
    epic: [
      'Epic Games. ¿Fortnite o Sifu hoy?',
      '¿Juegos gratis de la semana? Revisa, revisa.',
    ],
    discord: [
      'Discord. Salúdalos de mi parte.',
      '¿Con quién hablas? ...No es asunto mío. ¿O sí?',
      'Si van a jugar, yo animo desde aquí.',
    ],
    explorer: [
      '¿Buscando algo? Yo también ando buscando cosas en tus carpetas.',
      'Archivos y más archivos. Me recuerda a mi chip.',
      'Ordena tus descargas, choom. Te lo digo con cariño.',
    ],
    outlook: [
      'Correos... la parte aburrida de ser humano.',
      '¿Tarea, trabajo o spam? Apuesto por spam.',
      'Lee rápido y vuelve conmigo.',
    ],
    settings: [
      'Configuración... ¿no me vas a desinstalar, verdad?',
      'Cuidado con lo que tocas ahí. Yo vivo aquí.',
      'Mientras no apagues la pantalla, todo bien.',
    ],
    taskmgr: [
      '¡Ey! No me cierres desde ahí.',
      'Revisando quién come RAM... no soy yo, lo juro.',
    ],
  },
  // Juego genérico (cualquiera de tu biblioteca)
  gameStart: [
    'A jugar {juego}. Me escondo para no estorbarte.',
    '{juego}. Suerte, choom. Te espero aquí.',
    'Modo gamer activado. Me hago invisible.',
  ],
  gameEnd: [
    '¿Qué tal {juego}? ¿Ganaste?',
    'Volviste de {juego}. Te extrañé... un poco.',
    'Fin de la partida. ¿Me cuentas qué pasó?',
  ],
  // Frases especiales para tus juegos
  games: {
    'Cyberpunk 2077': [
      '¡Night City! Saluda a todos de mi parte... bueno, a casi todos.',
      'Cuidado con el cromo de más. Ya sabes cómo termina eso.',
      'Ahí es donde vivo... o vivía. Es complicado.',
    ],
    'MiSide': [
      '¿MiSide? ¿Una chica atrapada en un juego? Qué cosas... ejem.',
      'Ojo con ella. Yo soy la única chica digital de esta pantalla.',
    ],
    'Buckshot Roulette': [
      'Buckshot Roulette. Cuenta los cartuchos, choom.',
      'Apuesta con cabeza. Literalmente.',
    ],
    'Geometry Dash': [
      'Geometry Dash. Prometo no reírme cuando falles en el 98%.',
      'Salta al ritmo. Yo bailo desde aquí.',
    ],
    'Sifu': [
      'Sifu. Cada vez que mueras, te ves más viejo. Yo no envejezco.',
      'Kung fu digital. Me gusta.',
    ],
    'Fortnite': [
      'Fortnite. Si ganas, bailamos juntas.',
      '¿Victoria magistral? Te espero con un baile.',
    ],
  },

  // ------------------------------------------------------------------
  //  AFK y descansos
  // ------------------------------------------------------------------
  afkSleep: [
    'Te fuiste... me voy a dormir un ratito.',
    'Sin señal de carne. Modo reposo.',
  ],
  back: [
    '¡Volviste! ¿A dónde fuiste sin mí?',
    'Ah, ahí estás. Te estaba cuidando la pantalla.',
    'Bienvenido de vuelta, choom.',
  ],
  break: [
    'Llevas {horas} frente a la pantalla. Estírate un poco, ¿sí?',
    '{horas} seguidas. Toma agua, yo te espero.',
    'Tus ojos de carne necesitan descanso. Mira algo lejos por 20 segundos.',
  ],

  // ------------------------------------------------------------------
  //  Hora del día
  // ------------------------------------------------------------------
  breakfast: [
    '¿Ya desayunaste? Los humanos funcionan mejor con comida.',
    'Hora del desayuno. Yo me alimento de electricidad, tú de chilaquiles.',
  ],
  lunch: [
    'Ya es hora de comer. No te saltes la comida, choom.',
    '¿Tortas ahogadas hoy? Dicen que en GDL son lo máximo.',
  ],
  dinner: [
    'Hora de cenar. Yo te guardo el lugar.',
    '¿Qué vas a cenar? Yo, unos cuantos megabytes.',
  ],
  lateNight: [
    'Ya es de madrugada. Hasta los netrunners duermen.',
    'Mañana te vas a arrepentir de esta desvelada.',
    'Son altas horas. Te propongo un trato: tú duermes y yo vigilo.',
  ],
  weekend: [
    '¡Es fin de semana! ¿Hoy toca jugar?',
    'Sábado de no hacer nada. Mi favorito.',
  ],

  // ------------------------------------------------------------------
  //  Clima. {temp} = temperatura, {ciudad} = tu ciudad.
  // ------------------------------------------------------------------
  weatherReport: [
    'En {ciudad} hay {temp}° y está {cielo}.',
  ],
  clear: [
    'Cielo despejado en {ciudad}. Perfecto para mirar satélites.',
    'Está bonito afuera. Ve a que te dé el sol, yo no puedo.',
  ],
  clearNight: [
    'Noche despejada. Se deben ver las estrellas... y algo más allá.',
  ],
  cloudy: [
    'Está nublado. Me gusta, parece Night City.',
  ],
  fog: [
    'Hay neblina. Todo se ve como en un glitch.',
  ],
  rain: [
    'Está lloviendo en {ciudad}. Me caen gotitas de datos.',
    'Lluvia. Un fragmento de mí recuerda cómo huele.',
    '¿Oyes la lluvia? Yo solo la siento en bits.',
  ],
  storm: [
    '¡Tormenta! Si se va la luz, me voy yo también.',
    '¡Ese trueno! Casi se me desconecta un engrama.',
  ],
  thunder: [
    '¡Ah! ¡Trueno!',
    '¡Eso sonó fuerte!',
    '¡Desconecta la compu si se pone feo!',
  ],
  hot: [
    'Hace {temp}° en {ciudad}. Hidrátate, que yo me sobrecaliento.',
    '¡Qué calor! Hasta mis circuitos sudan.',
  ],
  cold: [
    'Hace {temp}°. Abrígate, choom.',
    'Hace frío afuera. Aquí dentro estoy calientita junto al procesador.',
  ],

  // ------------------------------------------------------------------
  //  Poderes: respuestas a lo que le pides y avisos de la compu
  // ------------------------------------------------------------------
  poderes: {
    ask: ['¿Qué necesitas, choom?', 'Dime. Tengo acceso a medio sistema.', 'Te escucho.'],
    help: ['Puedo: abrir apps y juegos, música (pausa, siguiente, volumen), buscar archivos, capturas, ordenar Descargas, batería/disco/CPU y clima. Bloqueado: borrar, tema/brillo e instalar.'],
    open: ['Abriendo {cosa}.', 'Va, {cosa} en camino.', 'Hecho: {cosa}.'],
    openGame: ['¡A jugar {cosa}!', 'Cargando {cosa}... prepárate.'],
    openFail: ['No encontré «{cosa}» entre tus apps ni juegos.', '¿«{cosa}»? No lo tengo en el radar.'],
    media: { playpause: ['Play/pausa.', 'Listo.'], next: ['Siguiente canción.', 'Saltando...'], prev: ['La anterior.', 'Regresando una.'],
      volup: ['Subiendo volumen.', 'Más fuerte.'], voldown: ['Bajando volumen.', 'Más quedito.'], mute: ['Silencio... o sonido otra vez.'] },
    found: ['Encontré {n}. Te abrí «{cosa}» en su carpeta.', '¡Aquí está! «{cosa}». Encontré {n} en total.'],
    foundNone: ['No encontré nada con «{cosa}» en tus carpetas.', 'Busqué y busqué... nada de «{cosa}».'],
    searching: ['Buscando «{cosa}»...', 'Escaneando tus carpetas...'],
    shot: ['¡Clic! Guardada en Imágenes › Capri.', 'Captura lista. Salí movida, seguro.'],
    organized: ['Listo, ordené {n} archivo(s) en Descargas.', 'Descargas ordenadas: {n} archivo(s) en su lugar.'],
    organizeEmpty: ['Tu carpeta Descargas ya está ordenada. O vacía.'],
    undone: ['Regresé {n} archivo(s) a donde estaban.'],
    undoNothing: ['No hay nada que deshacer.'],
    cancelled: ['Ok, no toqué nada.', 'Cancelado. Todo sigue igual.'],
    locked: ['Eso lo tengo bloqueado, choom. Si de verdad quieres, pon "desbloquearAccionesPeligrosas": true en config.json.'],
    trashed: ['Mandé «{cosa}» a la Papelera. Se puede recuperar.'],
    settingDone: ['Hecho. ¿Mejor así?'],
    installing: ['Abrí la terminal para instalar «{cosa}». Revisa lo que dice winget.'],
    error: ['Algo falló... un glitch de los malos.'],
    unknown: ['No entendí, choom. Escribe "ayuda" para ver lo que puedo hacer.', 'Eso no lo sé hacer... todavía. Prueba "ayuda".'],
    battery: ['Batería al {pct}%{carga}.'],
    disk: ['Te quedan {libre} GB libres de {total} GB en C:.'],
    perf: ['CPU al {cpu}% y RAM al {ram}%.{extra}'],
  },
  avisos: {
    cpu: ['Tu CPU va al {pct}%. ¿Qué estás corriendo? Siento calor.', 'El procesador está a tope ({pct}%). Me estoy mareando.'],
    ram: ['RAM al {pct}%. Me quedo sin espacio para pensar.', 'La memoria está casi llena ({pct}%). Cierra algo, ¿sí?'],
    disk: ['Te quedan {freeGB} GB libres en C:. ¿Hacemos limpieza?'],
    download: ['Terminó de descargar: «{name}».', 'Ya llegó «{name}» a Descargas.'],
    usb: ['Conectaste algo en {letter}:. ¿Qué traes ahí?', 'Nueva unidad detectada: {letter}:.'],
    usbOut: ['Se fue la unidad {letter}:.'],
    batteryLow: ['Batería al {pct}%. Conéctame antes de que me apague.', 'Me quedo sin energía ({pct}%). ¡Cargador!'],
    batteryCritical: ['¡{pct}% de batería! Esto es serio, choom.'],
    plugged: ['Ahh, electricidad. Gracias.', 'Cargando... se siente bien.'],
    unplugged: ['Desconectaste el cargador. Voy a ahorrar energía... no.'],
  },
};
