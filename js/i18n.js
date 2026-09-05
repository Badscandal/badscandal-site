/* ============================================================
   BADSCANDAL — i18n (EN / ES / PT), no libraries.

   HOW IT WORKS
   * The site is authored in ENGLISH. This file holds ES + PT-BR
     translations and rewrites the page ONCE at script-exec time.
   * MUST load BEFORE main.js / crt.js / store.js (end of body):
     - crt.js reads the .crt-fallback word at init -> "THE ROAD"
       must already be translated when it looks.
     - main.js wraps .roll labels into span pairs -> labels must
       already be translated before the wrap.
     - store.js calls window.BS_T() for its runtime strings.
   * Switching language stores the choice and RELOADS — no live
     re-render anywhere, which keeps store.js simple.
   * TEXT maps exact TEXT-NODE content (trimmed); HTML maps a
     selector to translated innerHTML for blocks that contain
     markup (.em italics, <b>, links). For selectors matching
     several elements, provide an ARRAY in DOM order.
   * "BADSCANDAL" is never translated. Product titles (the
     statements) are the print — never translated either.
   ============================================================ */
(function () {
  "use strict";

  var LANGS = ["en", "es", "pt"];
  var lang = "en";
  try { lang = localStorage.getItem("bs_lang") || "en"; } catch (e) {}
  if (LANGS.indexOf(lang) < 0) lang = "en";

  /* ---------- plain text nodes (exact trimmed match) -------------------- */
  var TEXT = {
    /* nav / menu / shared chrome */
    "Statements": { es: "Declaraciones", pt: "Declarações" },
    "Essentials": { es: "Esenciales", pt: "Essenciais" },
    "Tees": { es: "Camisetas", pt: "Camisetas" },
    "Hoodies": { es: "Sudaderas", pt: "Moletons" },
    "Tanks": { es: "Sin mangas", pt: "Regatas" },
    "Crop tops": { es: "Crop tops", pt: "Croppeds" },
    "Hats": { es: "Gorras", pt: "Bonés" },
    "Other": { es: "Otros", pt: "Outros" },
    "Story": { es: "Historia", pt: "História" },
    "Store": { es: "Tienda", pt: "Loja" },
    "Clothing store": { es: "Tienda de ropa", pt: "Loja de roupa" },
    "Plugin store": { es: "Tienda de plugins", pt: "Loja de plugins" },
    "Buy now": { es: "Comprar ahora", pt: "Comprar agora" },
    "Scroll to play": { es: "Desplázate para reproducir", pt: "Role para reproduzir" },
    "Instant key by email · 2 machines · works offline": { es: "Clave al instante por email · 2 equipos · funciona sin conexión", pt: "Chave na hora por e-mail · 2 máquinas · funciona offline" },
    "Key by email · Works offline": { es: "Clave por email · Funciona sin conexión", pt: "Chave por e-mail · Funciona offline" },
    "Home": { es: "Inicio", pt: "Início" },
    "About": { es: "Nosotros", pt: "Sobre" },
    "Contact": { es: "Contacto", pt: "Contato" },
    "Cart": { es: "Carrito", pt: "Carrinho" },
    "Menu": { es: "Menú", pt: "Menu" },
    "Close": { es: "Cerrar", pt: "Fechar" },
    "Navigation": { es: "Navegación", pt: "Navegação" },
    "Follow us": { es: "Síguenos", pt: "Siga a gente" },
    "(Ask AI about BADSCANDAL)": { es: "(Pregunta a la IA por BADSCANDAL)", pt: "(Pergunte à IA sobre a BADSCANDAL)" },
    "Ask Claude": { es: "Pregunta a Claude", pt: "Pergunte ao Claude" },
    "Ask ChatGPT": { es: "Pregunta a ChatGPT", pt: "Pergunte ao ChatGPT" },
    "Ask Perplexity": { es: "Pregunta a Perplexity", pt: "Pergunte ao Perplexity" },
    "Made to order · Shipped worldwide": { es: "Hecho por encargo · Envíos a todo el mundo", pt: "Feito sob demanda · Enviado para o mundo todo" },
    "BADSCANDAL — clothing for the ones who left. Statement\n  tees and essentials, made to order, shipped worldwide.":
      { es: "BADSCANDAL — ropa para los que se fueron. Camisetas con declaraciones y básicos, hechos por encargo, enviados a todo el mundo.",
        pt: "BADSCANDAL — roupa para quem foi embora. Camisetas de declaração e essenciais, feitos sob demanda, enviados para o mundo todo." },
    "『 No kings. No gods. No masters. 』": { es: "『 Ni reyes. Ni dioses. Ni amos. 』", pt: "『 Sem reis. Sem deuses. Sem donos. 』" },

    /* homepage */
    "Shop the drop": { es: "Compra el drop", pt: "Compre o drop" },
    "Luke & Lilian": { es: "Luke & Lilian", pt: "Luke & Lilian" },
    "Read the whole story": { es: "Lee la historia completa", pt: "Leia a história completa" },
    "Say it out loud": { es: "Dilo en voz alta", pt: "Diga em voz alta" },
    "Wear the trouble": { es: "Viste el problema", pt: "Vista o problema" },

    /* about modal */
    "About BADSCANDAL": { es: "Sobre BADSCANDAL", pt: "Sobre a BADSCANDAL" },
    "RUN BY LUKE & LILIAN": { es: "DIRIGIDO POR LUKE & LILIAN", pt: "TOCADO POR LUKE & LILIAN" },
    "WHEREVER WE ARE THIS MONTH": { es: "DONDE ESTEMOS ESTE MES", pt: "ONDE ESTIVERMOS ESTE MÊS" },
    "leave": { es: "irse", pt: "ir embora" },
    "chase": { es: "perseguir", pt: "correr atrás" },
    "ignore": { es: "ignorar", pt: "ignorar" },
    "repeat": { es: "repetir", pt: "repetir" },
    "Four thousand weeks": { es: "Cuatro mil semanas", pt: "Quatro mil semanas" },
    "The name": { es: "El nombre", pt: "O nome" },
    "Principles": { es: "Principios", pt: "Princípios" },
    "Mean it or bin it": { es: "Dilo en serio o a la basura", pt: "Fala sério ou joga fora" },
    "If a piece doesn't say something true, it doesn't go in the drop. Taste is the second filter. Honesty is the first.":
      { es: "Si una pieza no dice algo verdadero, no entra en el drop. El gusto es el segundo filtro. La honestidad es el primero.",
        pt: "Se uma peça não diz algo verdadeiro, não entra no drop. O gosto é o segundo filtro. A honestidade é o primeiro." },
    "All in or nothing": { es: "Todo o nada", pt: "Tudo ou nada" },
    "Fewer pieces, everything given. We'd rather make ten things we'd wear every day than a hundred we wouldn't.":
      { es: "Menos piezas, todo entregado. Preferimos hacer diez cosas que usaríamos a diario que cien que no.",
        pt: "Menos peças, tudo entregue. Preferimos fazer dez coisas que usaríamos todo dia do que cem que não." },
    "Say it out loud ": { es: "Dilo en voz alta", pt: "Diga em voz alta" },
    "If a statement needs explaining, it wasn't a statement. It goes across the back where people can read it from behind you.":
      { es: "Si una declaración necesita explicación, no era una declaración. Va en la espalda, donde la leen cuando te vas.",
        pt: "Se uma declaração precisa de explicação, não era uma declaração. Vai nas costas, onde leem quando você vai embora." },
    "Trouble over polish": { es: "Problema antes que pulido", pt: "Problema antes de polimento" },
    "Rushed work is forgettable and over-polished work is worse. The edge stays in.":
      { es: "El trabajo apurado se olvida y el sobre-pulido es peor. El filo se queda.",
        pt: "Trabalho apressado se esquece e trabalho polido demais é pior. O corte fica." },
    "Wholesale, press and anything else:": { es: "Mayoreo, prensa y todo lo demás:", pt: "Atacado, imprensa e todo o resto:" },

    /* us page — plain blocks */
    "The story": { es: "La historia", pt: "A história" },
    "THE ROAD": { es: "EL CAMINO", pt: "A ESTRADA" },
    "The road so far": { es: "El camino hasta ahora", pt: "A estrada até aqui" },
    "Ireland → out · one-way": { es: "Irlanda → fuera · solo ida", pt: "Irlanda → fora · só ida" },
    "Country, family, the pension talk — all of it.\n        Everyone said too fast, too crazy, too much. They were still saying it\n        when the plane took off.":
      { es: "País, familia, la charla de la pensión — todo. Todos decían demasiado rápido, demasiado loco, demasiado. Lo seguían diciendo cuando despegó el avión.",
        pt: "País, família, o papo da aposentadoria — tudo. Todo mundo dizia rápido demais, louco demais, demais. Ainda estavam dizendo quando o avião decolou." },
    "Gibraltar · two witnesses": { es: "Gibraltar · dos testigos", pt: "Gibraltar · duas testemunhas" },
    "No venue, no seating chart, no speech from an\n        uncle. A registry office on a limestone rock and the two of us grinning\n        like we'd got away with something. We had.":
      { es: "Sin salón, sin plano de mesas, sin discurso de un tío. Un registro civil sobre una roca caliza y nosotros dos sonriendo como si nos hubiéramos salido con la nuestra. Así fue.",
        pt: "Sem salão, sem mapa de mesas, sem discurso de tio. Um cartório numa rocha de calcário e nós dois sorrindo como quem se safou de algo. E se safou." },
    "Brazil → Vietnam · no return date": { es: "Brasil → Vietnam · sin fecha de vuelta", pt: "Brasil → Vietnã · sem data de volta" },
    "Her family's side of the world, then the far side\n        of it. We make things as we go, the clothes travel with us — and the\n        opinions everyone had get very quiet from this far away.":
      { es: "El lado del mundo de su familia, y luego el otro extremo. Creamos cosas por el camino, la ropa viaja con nosotros — y las opiniones de todos se oyen muy poco desde tan lejos.",
        pt: "O lado do mundo da família dela, depois o outro extremo. Criamos coisas pelo caminho, a roupa viaja com a gente — e as opiniões de todo mundo ficam bem quietas de tão longe." },
    "Why": { es: "Por qué", pt: "Por quê" },
    "Read the whole thing": { es: "Léelo completo", pt: "Leia tudo" },
    "The arithmetic": { es: "La aritmética", pt: "A aritmética" },
    "Weeks in an average life. That's the entire allocation — not per\n      decade, not per chapter. The whole thing.":
      { es: "Semanas en una vida promedio. Esa es toda la asignación — no por década, no por capítulo. Todo.",
        pt: "Semanas numa vida média. Essa é a cota inteira — não por década, não por capítulo. O total." },
    "Already gone by thirty. Nobody mentions this, and it is the single\n      most useful number we know.":
      { es: "Ya gastadas a los treinta. Nadie lo menciona, y es el número más útil que conocemos.",
        pt: "Já se foram aos trinta. Ninguém fala disso, e é o número mais útil que conhecemos." },
    "The club": { es: "El club", pt: "O clube" },
    "Membership is simple: wear it, mean it, and stop apologising\n    for taking up space.":
      { es: "La membresía es simple: póntelo, dilo en serio, y deja de pedir perdón por ocupar espacio.",
        pt: "Ser membro é simples: vista, fale sério, e pare de pedir desculpa por ocupar espaço." },
    "Take me to the store": { es: "Llévame a la tienda", pt: "Me leva pra loja" },
    "How it goes": { es: "Cómo funciona", pt: "Como funciona" },
    "Step 01": { es: "Paso 01", pt: "Passo 01" },
    "Step 02": { es: "Paso 02", pt: "Passo 02" },
    "Step 03": { es: "Paso 03", pt: "Passo 03" },
    "We say it first": { es: "Primero lo decimos", pt: "Primeiro a gente fala" },
    "Every piece starts as something one of us actually said out loud and\n        then thought better of. Those are the good ones. If it doesn't make us\n        slightly nervous, it doesn't get printed.":
      { es: "Cada pieza empieza como algo que uno de nosotros dijo en voz alta y luego se lo pensó. Esas son las buenas. Si no nos pone un poco nerviosos, no se imprime.",
        pt: "Cada peça começa como algo que um de nós falou em voz alta e depois repensou. Essas são as boas. Se não deixa a gente meio nervoso, não vai pra estampa." },
    "We make the thing": { es: "Hacemos la pieza", pt: "A gente faz a peça" },
    "Heavyweight cotton, printed big enough to read from across the road.\n        Most of the statements live across the back, because that's the side of\n        you people are looking at when you walk away.":
      { es: "Algodón pesado, impreso lo bastante grande para leerse desde la otra acera. La mayoría de las declaraciones van en la espalda, porque ese es el lado que la gente mira cuando te vas.",
        pt: "Algodão pesado, estampado grande o bastante pra ler do outro lado da rua. A maioria das declarações vai nas costas, porque é esse lado que as pessoas olham quando você vai embora." },
    "You wear it out": { es: "Tú lo sacas a la calle", pt: "Você veste pra rua" },
    "Somebody reads it, somebody has an opinion about it, and that's the\n        entire point. Then we go again.":
      { es: "Alguien lo lee, alguien opina, y ese es exactamente el punto. Y vamos otra vez.",
        pt: "Alguém lê, alguém tem opinião, e esse é exatamente o ponto. Aí vamos de novo." },
    "What does BADSCANDAL stand for?": { es: "¿Qué significa BADSCANDAL?", pt: "O que BADSCANDAL significa?" },
    "Who's behind it?": { es: "¿Quién está detrás?", pt: "Quem está por trás?" },
    "What's the difference between Statements and Essentials?": { es: "¿Cuál es la diferencia entre Declaraciones y Esenciales?", pt: "Qual a diferença entre Declarações e Essenciais?" },
    "What if someone's offended by what's printed on it?": { es: "¿Y si a alguien le ofende lo impreso?", pt: "E se alguém se ofender com a estampa?" },
    "Where do you ship?": { es: "¿A dónde envían?", pt: "Para onde vocês enviam?" },
    "Got more questions? Contact us": { es: "¿Más preguntas? Escríbenos", pt: "Mais perguntas? Fala com a gente" },
    "Where the whole thing gets filmed": { es: "Donde se filma todo", pt: "Onde tudo é filmado" },
    "Day to day, wherever we are": { es: "El día a día, donde estemos", pt: "O dia a dia, onde estivermos" },
    "The short version": { es: "La versión corta", pt: "A versão curta" },
    "Lately": { es: "Últimamente", pt: "Ultimamente" },
    "View all on Instagram": { es: "Ver todo en Instagram", pt: "Ver tudo no Instagram" },
    "Wear it": { es: "Póntelo", pt: "Vista" },

    /* store page */
    "The first drop": { es: "El primer drop", pt: "O primeiro drop" },

    /* product modal / size guide / cart (static markup) */
    "Size": { es: "Talla", pt: "Tamanho" },
    "Add to cart": { es: "Añadir al carrito", pt: "Adicionar ao carrinho" },
    "Size guide": { es: "Guía de tallas", pt: "Guia de tamanhos" },
    "Your cart": { es: "Tu carrito", pt: "Seu carrinho" },
    "Nothing in here yet. Fix that.": { es: "Aquí no hay nada todavía. Arréglalo.", pt: "Nada aqui ainda. Resolve isso." },
    "Subtotal": { es: "Subtotal", pt: "Subtotal" },
    "Shipping & taxes calculated at checkout.": { es: "Envío e impuestos se calculan al pagar.", pt: "Frete e impostos calculados no checkout." },
    "Checkout": { es: "Pagar", pt: "Finalizar compra" },

    /* store.js runtime strings (via BS_T) */
    "Everything": { es: "Todo", pt: "Tudo" },
    "All": { es: "Todas", pt: "Todas" },
    "Statement": { es: "Declaración", pt: "Declaração" },
    "Tee": { es: "Camiseta", pt: "Camiseta" },
    "Hoodie": { es: "Sudadera", pt: "Moletom" },
    "Tank": { es: "Sin mangas", pt: "Regata" },
    "Crop top": { es: "Crop top", pt: "Cropped" },
    "Hat": { es: "Gorra", pt: "Boné" },
    "Quick add": { es: "Añadir rápido", pt: "Adicionar rápido" },
    "Choose options": { es: "Elige opciones", pt: "Escolher opções" },
    "Colour": { es: "Color", pt: "Cor" },
    "Print": { es: "Estampado", pt: "Estampa" },
    "Red on white": { es: "Rojo sobre blanco", pt: "Vermelho no branco" },
    "White on black": { es: "Blanco sobre negro", pt: "Branco no preto" },
    "Black on white": { es: "Negro sobre blanco", pt: "Preto no branco" },
    "Nothing here yet — check another section.": { es: "Aquí no hay nada — mira otra sección.", pt: "Nada aqui — olha outra seção." },
    "Couldn't update the bag — try again.": { es: "No se pudo actualizar el carrito — inténtalo otra vez.", pt: "Não deu para atualizar o carrinho — tenta de novo." },
    "Couldn't reach the store right now — showing the lookbook instead.": { es: "No pudimos conectar con la tienda — mostramos el lookbook.", pt: "Não conseguimos falar com a loja — mostrando o lookbook." },
    "Demo mode — connect your Shopify store in js/store.js (two lines at the top) to enable real checkout.":
      { es: "Modo demo — conecta tu tienda Shopify en js/store.js para activar el pago real.",
        pt: "Modo demo — conecte sua loja Shopify em js/store.js para ativar o checkout real." },
    "Preview drop — demo products. Real stock lands when Shopify connects.":
      { es: "Drop de vista previa — productos demo. El stock real llega cuando Shopify conecte.",
        pt: "Drop de prévia — produtos demo. O estoque real chega quando a Shopify conectar." },
    /* ---------- plugin store (plugin.html) — added 5 Sep 2026 ---------- */
    "BADSCANDAL audio · vocal chain": { es: "BADSCANDAL audio · cadena vocal", pt: "BADSCANDAL audio · cadeia vocal" },
    "Mac & Windows": { es: "Mac y Windows", pt: "Mac e Windows" },
    "8 modules · one window": { es: "8 módulos · una ventana", pt: "8 módulos · uma janela" },
    "10.7 ms tracking mode": { es: "modo tracking de 10,7 ms", pt: "modo tracking de 10,7 ms" },
    "What it is": { es: "Qué es", pt: "O que é" },
    "Formats": { es: "Formatos", pt: "Formatos" },
    "Systems": { es: "Sistemas", pt: "Sistemas" },
    "Modules": { es: "Módulos", pt: "Módulos" },
    "Presets": { es: "Presets", pt: "Presets" },
    "Tested on": { es: "Probado con", pt: "Testado com" },
    "Live": { es: "En directo", pt: "Ao vivo" },
    "macOS 11+ (Apple silicon & Intel) · Windows 10+": { es: "macOS 11+ (Apple silicon e Intel) · Windows 10+", pt: "macOS 11+ (Apple silicon e Intel) · Windows 10+" },
    "7 presets made by engineers, plus your own": { es: "7 presets hechos por ingenieros, más los tuyos", pt: "7 presets feitos por engenheiros, mais os seus" },
    "A wide range of microphones, dynamic to condenser": { es: "Una amplia gama de micrófonos, de dinámicos a condensadores", pt: "Uma ampla gama de microfones, de dinâmicos a condensadores" },
    "TRACK mode · 10.7 ms latency": { es: "Modo TRACK · 10,7 ms de latencia", pt: "Modo TRACK · 10,7 ms de latência" },
    "Signal flow · top to bottom": { es: "Flujo de señal · de arriba abajo", pt: "Fluxo de sinal · de cima para baixo" },
    "Adaptive suppression that kills the room, not the take. No learn button, nothing to arm — it just listens.":
      { es: "Supresión adaptativa que elimina la sala, no la toma. Sin botón de aprendizaje, nada que armar: solo escucha.",
        pt: "Supressão adaptativa que elimina a sala, não o take. Sem botão de aprendizado, nada para armar: ela só escuta." },
    "High-pass, low-pass and the mud filter. The stuff you do on every vocal, done before you have to think about it.":
      { es: "Paso alto, paso bajo y el filtro de barro. Lo que haces en cada voz, hecho antes de que tengas que pensarlo.",
        pt: "Passa-alta, passa-baixa e o filtro de lama. O que você faz em todo vocal, feito antes de você precisar pensar." },
    "Resonance control with four nodes and a live reduction burn. Boxiness, harshness and mic ring, carved out as they appear.":
      { es: "Control de resonancias con cuatro nodos y reducción visible en vivo. Cajón, aspereza y resonancia del micro, eliminados según aparecen.",
        pt: "Controle de ressonâncias com quatro nós e redução visível ao vivo. Caixa, aspereza e ressonância do mic, removidos assim que aparecem." },
    "Oversampled tape saturation with Character, Steady, Focus and Tube. Level-invariant, so quiet takes get the same glow.":
      { es: "Saturación de cinta con sobremuestreo y Character, Steady, Focus y Tube. Invariante al nivel: las tomas suaves reciben el mismo brillo.",
        pt: "Saturação de fita com oversampling e Character, Steady, Focus e Tube. Invariante ao nível: takes baixos ganham o mesmo brilho." },
    "Adaptive threshold, no attack, no release, no lisp. Wide or split, it only ever touches the ess.":
      { es: "Umbral adaptativo, sin ataque, sin release, sin ceceo. Ancho o dividido, solo toca la ese.",
        pt: "Threshold adaptativo, sem attack, sem release, sem ceceio. Largo ou dividido, só toca no esse." },
    "Twelve surgical bands, ten shapes, slopes to 96 dB, per-band dynamics. Air Link lifts the top as the de-esser works.":
      { es: "Doce bandas quirúrgicas, diez formas, pendientes hasta 96 dB, dinámica por banda. Air Link abre el aire mientras el de-esser trabaja.",
        pt: "Doze bandas cirúrgicas, dez formas, slopes até 96 dB, dinâmica por banda. O Air Link abre o topo enquanto o de-esser trabalha." },
    "A FET compressor in the classic fast style: grabs the peaks, adds the grit, holds the vocal in front.":
      { es: "Un compresor FET del estilo rápido clásico: atrapa los picos, añade carácter, mantiene la voz delante.",
        pt: "Um compressor FET no estilo rápido clássico: segura os picos, adiciona textura, mantém o vocal na frente." },
    "Opto levelling after the catch. Slow, musical, invisible — the reason the vocal never leaves the mix.":
      { es: "Nivelación óptica después del catch. Lenta, musical, invisible: la razón por la que la voz nunca se pierde en la mezcla.",
        pt: "Nivelamento óptico depois do catch. Lento, musical, invisível: o motivo de o vocal nunca sumir da mix." },
    "The boring bits": { es: "La parte aburrida", pt: "A parte chata" },
    "DAWs": { es: "DAWs", pt: "DAWs" },
    "Latency": { es: "Latencia", pt: "Latência" },
    "Loudness match": { es: "Igualación de nivel", pt: "Igualação de nível" },
    "Licence": { es: "Licencia", pt: "Licença" },
    "Delivery": { es: "Entrega", pt: "Entrega" },
    "Updates": { es: "Actualizaciones", pt: "Atualizações" },
    "Made by": { es: "Hecho por", pt: "Feito por" },
    "AU, VST3, Standalone app": { es: "AU, VST3, app independiente", pt: "AU, VST3, app standalone" },
    "Logic, Ableton Live, FL Studio, Cubase, Studio One, Reaper, Bitwig, Luna, GarageBand — anything that loads AU or VST3":
      { es: "Logic, Ableton Live, FL Studio, Cubase, Studio One, Reaper, Bitwig, Luna, GarageBand: cualquiera que cargue AU o VST3",
        pt: "Logic, Ableton Live, FL Studio, Cubase, Studio One, Reaper, Bitwig, Luna, GarageBand: qualquer um que carregue AU ou VST3" },
    "macOS 11 or later, universal binary. Windows 10 or later, 64-bit":
      { es: "macOS 11 o posterior, binario universal. Windows 10 o posterior, 64 bits",
        pt: "macOS 11 ou superior, binário universal. Windows 10 ou superior, 64 bits" },
    "~95 ms full chain, reported to the host. TRACK mode: 10.7 ms for live monitoring":
      { es: "~95 ms con toda la cadena, informados al host. Modo TRACK: 10,7 ms para monitorizar en directo",
        pt: "~95 ms com a cadeia completa, reportados ao host. Modo TRACK: 10,7 ms para monitorar ao vivo" },
    "1:1 button — the output lands at the input level whatever the chain did":
      { es: "Botón 1:1: la salida queda al nivel de entrada hiciera lo que hiciera la cadena",
        pt: "Botão 1:1: a saída fica no nível da entrada, não importa o que a cadeia fez" },
    "One key, two machines, activate once then work offline. Move seats yourself":
      { es: "Una clave, dos equipos, actívala una vez y trabaja sin conexión. Mueve las licencias tú mismo",
        pt: "Uma chave, duas máquinas, ative uma vez e trabalhe offline. Mova as ativações você mesmo" },
    "Key and installers by email the moment payment clears":
      { es: "Clave e instaladores por email en cuanto se confirma el pago",
        pt: "Chave e instaladores por e-mail assim que o pagamento é confirmado" },
    "One update a month, free with your key": { es: "Una actualización al mes, gratis con tu clave", pt: "Uma atualização por mês, grátis com a sua chave" },
    "BADSCANDAL Audio — engineers and vocalists": { es: "BADSCANDAL Audio: ingenieros y vocalistas", pt: "BADSCANDAL Audio: engenheiros e vocalistas" },
    "One licence. Every DAW you own. The whole vocal chain, in the order it should run, in one window. Pay once and the key is in your inbox before you've closed the tab.":
      { es: "Una licencia. Todos los DAW que tengas. La cadena vocal completa, en el orden correcto, en una sola ventana. Paga una vez y la clave llega a tu correo antes de que cierres la pestaña.",
        pt: "Uma licença. Todos os DAWs que você tiver. A cadeia vocal completa, na ordem certa, em uma única janela. Pague uma vez e a chave chega no seu e-mail antes de você fechar a aba." },
    "Instant key by email": { es: "Clave al instante por email", pt: "Chave na hora por e-mail" },
    "2 machines": { es: "2 equipos", pt: "2 máquinas" },
    "Works offline": { es: "Funciona sin conexión", pt: "Funciona offline" },
    "Monthly updates": { es: "Actualizaciones mensuales", pt: "Atualizações mensais" },
    "Questions": { es: "Preguntas", pt: "Perguntas" },
    "Will it load in my DAW?": { es: "¿Funciona en mi DAW?", pt: "Funciona no meu DAW?" },
    "If your DAW loads AU or VST3, yes. Logic, Ableton, FL, Cubase, Studio One, Reaper, Bitwig, Luna and GarageBand are all covered. Pro Tools (AAX) isn't at launch — if you need it, tell us and it moves up the list.":
      { es: "Si tu DAW carga AU o VST3, sí. Logic, Ableton, FL, Cubase, Studio One, Reaper, Bitwig, Luna y GarageBand están cubiertos. Pro Tools (AAX) no está en el lanzamiento: si lo necesitas, dínoslo y sube en la lista.",
        pt: "Se o seu DAW carrega AU ou VST3, sim. Logic, Ableton, FL, Cubase, Studio One, Reaper, Bitwig, Luna e GarageBand estão cobertos. Pro Tools (AAX) não está no lançamento: se você precisa, avise e ele sobe na lista." },
    "How does the licence work?": { es: "¿Cómo funciona la licencia?", pt: "Como funciona a licença?" },
    "You get a key by email. Enter it once on each machine (up to two), and from then on the plugin works with no internet at all. Deactivate a seat yourself when you change computers. Until a key is entered the plugin passes audio through clean, so a session never goes silent.":
      { es: "Recibes una clave por email. Introdúcela una vez en cada equipo (hasta dos) y a partir de ahí el plugin funciona sin ninguna conexión. Desactiva una licencia tú mismo cuando cambies de ordenador. Hasta que introduzcas la clave, el plugin deja pasar el audio limpio, así que una sesión nunca se queda en silencio.",
        pt: "Você recebe uma chave por e-mail. Insira uma vez em cada máquina (até duas) e, a partir daí, o plugin funciona sem nenhuma internet. Desative uma ativação você mesmo quando trocar de computador. Até a chave ser inserida, o plugin deixa o áudio passar limpo, então uma sessão nunca fica muda." },
    "Is there a trial?": { es: "¿Hay versión de prueba?", pt: "Tem versão de teste?" },
    "Not yet. Everything on this page is the real plugin, recorded through it. If it doesn't do what it says on a vocal you own, write to us within 14 days and we'll sort it.":
      { es: "Todavía no. Todo lo que ves en esta página es el plugin real, grabado a través de él. Si no hace lo que promete con una voz tuya, escríbenos en 14 días y lo resolvemos.",
        pt: "Ainda não. Tudo nesta página é o plugin real, gravado através dele. Se ele não fizer o que promete em um vocal seu, escreva em até 14 dias e a gente resolve." },
    "Do I get updates?": { es: "¿Recibo actualizaciones?", pt: "Recebo atualizações?" },
    "Yes. We treat a purchase as something to maintain and improve, not something to sell and forget. CLEANSLATE receives one update every month, refining the existing modules and adding new features, with a single aim: the most efficient all-in-one vocal chain for producers and artists.":
      { es: "Sí. Tratamos una compra como algo que hay que mantener y mejorar, no algo que se vende y se olvida. CLEANSLATE recibe una actualización cada mes, refinando los módulos existentes y añadiendo funciones nuevas, con un único objetivo: la cadena vocal todo en uno más eficiente para productores y artistas.",
        pt: "Sim. Tratamos uma compra como algo para manter e melhorar, não algo para vender e esquecer. O CLEANSLATE recebe uma atualização por mês, refinando os módulos existentes e adicionando novos recursos, com um único objetivo: a cadeia vocal tudo-em-um mais eficiente para produtores e artistas." },
    "Key by email · Works offline": { es: "Clave por email · Funciona sin conexión", pt: "Chave por e-mail · Funciona offline" },
    "CLEANSLATE — the BADSCANDAL vocal chain. Eight modules, one window, every DAW. Made by engineers and vocalists.":
      { es: "CLEANSLATE: la cadena vocal de BADSCANDAL. Ocho módulos, una ventana, todos los DAW. Hecho por ingenieros y vocalistas.",
        pt: "CLEANSLATE: a cadeia vocal da BADSCANDAL. Oito módulos, uma janela, todos os DAWs. Feito por engenheiros e vocalistas." },
    /* ---------- plugin store: module details (5 Sep 2026) ---------- */
    "What it does": { es: "Qué hace", pt: "O que faz" },
    "Why it's better": { es: "Por qué es mejor", pt: "Por que é melhor" },
    "The controls": { es: "Los controles", pt: "Os controles" },
    "Close": { es: "Cerrar", pt: "Fechar" },
    "Tap for the full story": { es: "Toca para la historia completa", pt: "Toque para a história completa" },
    "An adaptive noise suppressor that tracks the room's noise floor and subtracts it before anything else in the chain hears it.":
      { es: "Un supresor de ruido adaptativo que sigue el suelo de ruido de la sala y lo resta antes de que el resto de la cadena lo oiga.",
        pt: "Um supressor de ruído adaptativo que acompanha o piso de ruído da sala e o subtrai antes que o resto da cadeia o ouça." },
    "It listens to the spectrum continuously and builds a model of everything that is not the voice: air conditioning, computer fans, hum, hiss. That model is subtracted between and under the words, and what remains in the pauses is a steady, natural room tone rather than a gate opening and closing. There is no learn button to press and nothing to arm mid-take.":
      { es: "Escucha el espectro continuamente y construye un modelo de todo lo que no es la voz: aire acondicionado, ventiladores, zumbido, siseo. Ese modelo se resta entre y debajo de las palabras, y lo que queda en las pausas es un tono de sala estable y natural, no una puerta abriéndose y cerrándose. No hay botón de aprendizaje que pulsar ni nada que armar en mitad de la toma.",
        pt: "Ele escuta o espectro continuamente e constrói um modelo de tudo o que não é a voz: ar-condicionado, ventoinhas, hum, chiado. Esse modelo é subtraído entre e sob as palavras, e o que sobra nas pausas é um tom de sala estável e natural, não um gate abrindo e fechando. Não há botão de aprendizado para apertar nem nada para armar no meio do take." },
    "The gain rule is the same class of speech-enhancement mathematics used in broadcast and forensic tools, tuned for sung vocals rather than speech. Held notes lose almost nothing (measured erosion of 0.04 dB on sustained tones), sibilance and breath onsets keep their attack, hum and whine that sit still for a few seconds are absorbed into the noise model, and a comfort-noise bed keeps pauses sounding like a room instead of a vacuum. Everything that is not voice gets quieter; the voice stays exactly where it was.":
      { es: "La regla de ganancia es la misma clase de matemáticas de realce de voz que usan las herramientas de radiodifusión y forenses, afinada para voz cantada en lugar de hablada. Las notas sostenidas apenas pierden nada (erosión medida de 0,04 dB en tonos sostenidos), las sibilantes y los ataques de respiración conservan su transitorio, el zumbido que se mantiene quieto unos segundos se absorbe en el modelo de ruido, y una cama de ruido de confort hace que las pausas suenen a sala y no a vacío. Todo lo que no es voz baja; la voz se queda exactamente donde estaba.",
        pt: "A regra de ganho é a mesma classe de matemática de realce de fala usada em ferramentas de broadcast e forenses, ajustada para voz cantada em vez de falada. Notas sustentadas quase não perdem nada (erosão medida de 0,04 dB em tons sustentados), sibilantes e ataques de respiração mantêm o transiente, hum que fica parado por alguns segundos é absorvido pelo modelo de ruído, e uma cama de ruído de conforto faz as pausas soarem como sala e não como vácuo. Tudo o que não é voz fica mais baixo; a voz fica exatamente onde estava." },
    "How much of the noise between and under the words is removed. 100 is full reduction down to the ambience floor; 30 is a gentle clean-up.": { es: "Cuánto ruido entre y debajo de las palabras se elimina. 100 es reducción total hasta el suelo de ambiente; 30 es una limpieza suave.", pt: "Quanto do ruído entre e sob as palavras é removido. 100 é redução total até o piso de ambiente; 30 é uma limpeza suave." },
    "How much room tone is left behind. Lower is drier; the remaining floor is a steady bed, so pauses never sound gated.": { es: "Cuánto tono de sala se deja. Más bajo es más seco; el suelo restante es una cama estable, así que las pausas nunca suenan a puerta.", pt: "Quanto tom de sala fica. Mais baixo é mais seco; o piso restante é uma cama estável, então as pausas nunca soam com gate." },
    "Monitors only what is being removed. If you can hear words in here, back off AMOUNT.": { es: "Monitoriza solo lo que se está quitando. Si oyes palabras aquí, baja AMOUNT.", pt: "Monitora só o que está sendo removido. Se você ouvir palavras aqui, diminua o AMOUNT." },
    "A high-pass filter and a low-mid cut, placed first so every stage after them works on a clean signal.":
      { es: "Un filtro paso alto y un corte de medios graves, colocados primero para que cada etapa posterior trabaje sobre una señal limpia.",
        pt: "Um filtro passa-alta e um corte de médios-graves, colocados primeiro para que cada estágio seguinte trabalhe sobre um sinal limpo." },
    "The high-pass removes handling noise, proximity boom and stand rumble below the voice, at 12, 24 or 48 dB per octave. The mud cut is a single bell in the 150 to 500 Hz region where boxiness lives. Sweeping the corner glides instead of stepping, and changing the slope crossfades between filters so nothing clicks.":
      { es: "El paso alto elimina ruido de manipulación, exceso de proximidad y retumbo del pie por debajo de la voz, a 12, 24 o 48 dB por octava. El corte de barro es una sola campana en la región de 150 a 500 Hz donde vive el sonido a caja. Barrer la frecuencia se desliza en lugar de saltar, y cambiar la pendiente hace un crossfade entre filtros para que nada haga clic.",
        pt: "O passa-alta remove ruído de manuseio, excesso de proximidade e rumble do pedestal abaixo da voz, a 12, 24 ou 48 dB por oitava. O corte de lama é um único sino na região de 150 a 500 Hz onde mora o som encaixotado. Varrer a frequência desliza em vez de pular, e mudar o slope faz um crossfade entre filtros para nada estalar." },
    "These are the two moves every engineer makes on every vocal, done in one place and done precisely: double-precision filters, a corner that glides instead of stepping, and slope changes that never pop in a session. Getting this out of the way early means the compressors and the tape are never fed rumble they would otherwise react to.":
      { es: "Son los dos movimientos que todo ingeniero hace en toda voz, hechos en un solo sitio y con precisión: filtros de doble precisión, una frecuencia de corte que se desliza en lugar de saltar y cambios de pendiente que nunca hacen pop en la sesión. Resolver esto al principio significa que los compresores y la cinta nunca reciben un retumbo al que reaccionarían.",
        pt: "São os dois movimentos que todo engenheiro faz em todo vocal, feitos em um só lugar e com precisão: filtros de dupla precisão, uma frequência de corte que desliza em vez de pular e mudanças de slope que nunca estalam na sessão. Resolver isso logo no início significa que os compressores e a fita nunca recebem um rumble ao qual reagiriam." },
    "High-pass corner. Removes rumble, handling noise and proximity boom below the voice.": { es: "Frecuencia del paso alto. Elimina retumbo, ruido de manipulación y exceso de proximidad por debajo de la voz.", pt: "Frequência do passa-alta. Remove rumble, ruído de manuseio e excesso de proximidade abaixo da voz." },
    "Steepness of the high-pass: 12, 24 or 48 dB per octave. Steeper is cleaner but less natural right at the corner.": { es: "Pendiente del paso alto: 12, 24 o 48 dB por octava. Más pronunciada es más limpia pero menos natural justo en el corte.", pt: "Inclinação do passa-alta: 12, 24 ou 48 dB por oitava. Mais íngreme é mais limpo, mas menos natural bem no corte." },
    "Centre of the low-mid cut, where boxiness lives, roughly 150 to 500 Hz.": { es: "Centro del corte de medios graves, donde vive el sonido a caja, entre 150 y 500 Hz.", pt: "Centro do corte de médios-graves, onde mora o som encaixotado, entre 150 e 500 Hz." },
    "Depth of the low-mid cut.": { es: "Profundidad del corte de medios graves.", pt: "Profundidade do corte de médios-graves." },
    "Width of the low-mid cut. Higher is narrower.": { es: "Anchura del corte de medios graves. Más alto es más estrecho.", pt: "Largura do corte de médios-graves. Mais alto é mais estreito." },
    "A dynamic resonance suppressor with four nodes that watches your vocal for build-ups and pushes them down as they happen.":
      { es: "Un supresor de resonancias dinámico con cuatro nodos que vigila tu voz en busca de acumulaciones y las baja según ocurren.",
        pt: "Um supressor de ressonâncias dinâmico com quatro nós que vigia o seu vocal em busca de acúmulos e os abaixa conforme acontecem." },
    "You place up to four nodes on the regions where a voice tends to ring: low-mid boxiness, upper-mid harshness, mic and room resonances. Spectral listens inside each region and, when a peak stands out from the harmonics around it, dips exactly that peak by exactly as much as it sticks out. When nothing resonates, nothing is removed. The display shows the reduction being carved in real time.":
      { es: "Colocas hasta cuatro nodos en las regiones donde una voz tiende a resonar: caja en los medios graves, aspereza en los medios agudos, resonancias del micro y de la sala. Spectral escucha dentro de cada región y, cuando un pico sobresale de los armónicos que lo rodean, atenúa exactamente ese pico exactamente lo que sobresale. Cuando nada resuena, nada se elimina. La pantalla muestra la reducción tallándose en tiempo real.",
        pt: "Você coloca até quatro nós nas regiões onde uma voz tende a ressoar: caixa nos médios-graves, aspereza nos médios-agudos, ressonâncias do mic e da sala. O Spectral escuta dentro de cada região e, quando um pico se destaca dos harmônicos ao redor, abaixa exatamente esse pico exatamente o quanto ele se destaca. Quando nada ressoa, nada é removido. A tela mostra a redução sendo esculpida em tempo real." },
    "Calibrated against the industry reference for this kind of processing, so depth, width and timing behave the way experienced engineers expect. Precision narrows each notch toward surgical, Selectivity leaves ordinary harmonics alone and catches only true resonances, and reduction saturates rather than chasing every peak, which is why it stays musical at high depth. A Delta mode plays only what is being removed, so you always know what you are giving up.":
      { es: "Calibrado frente a la referencia de la industria para este tipo de procesado, así que profundidad, anchura y tiempos se comportan como esperan los ingenieros experimentados. Precision estrecha cada notch hacia lo quirúrgico, Selectivity deja en paz los armónicos normales y solo atrapa resonancias reales, y la reducción se satura en lugar de perseguir cada pico, por eso sigue siendo musical a mucha profundidad. Un modo Delta reproduce solo lo que se está quitando, así que siempre sabes a qué renuncias.",
        pt: "Calibrado contra a referência da indústria para esse tipo de processamento, então profundidade, largura e tempos se comportam como engenheiros experientes esperam. Precision estreita cada notch rumo ao cirúrgico, Selectivity deixa os harmônicos normais em paz e pega só ressonâncias reais, e a redução satura em vez de perseguir cada pico, por isso continua musical em profundidades altas. Um modo Delta toca só o que está sendo removido, então você sempre sabe do que está abrindo mão." },
    "How far resonances are pushed down. Reduction saturates instead of chasing every peak, so it stays musical.": { es: "Cuánto se bajan las resonancias. La reducción se satura en lugar de perseguir cada pico, así que sigue siendo musical.", pt: "Quanto as ressonâncias são abaixadas. A redução satura em vez de perseguir cada pico, então continua musical." },
    "Width and maximum depth of each notch. Low is broad and shallow, high is narrow and surgical.": { es: "Anchura y profundidad máxima de cada notch. Bajo es ancho y superficial, alto es estrecho y quirúrgico.", pt: "Largura e profundidade máxima de cada notch. Baixo é largo e raso, alto é estreito e cirúrgico." },
    "How prominent a peak must be before it counts. Higher leaves ordinary harmonics alone and only catches real resonances.": { es: "Cuánto debe sobresalir un pico para contar. Más alto deja en paz los armónicos normales y solo atrapa resonancias reales.", pt: "Quanto um pico precisa se destacar para contar. Mais alto deixa os harmônicos normais em paz e só pega ressonâncias reais." },
    "How quickly suppression engages and lets go, in milliseconds.": { es: "Con qué rapidez la supresión entra y se suelta, en milisegundos.", pt: "Com que rapidez a supressão entra e solta, em milissegundos." },
    "SOFT eases resonances down in proportion to how much they stick out. HARD lets absolute level push harder.": { es: "SOFT baja las resonancias en proporción a cuánto sobresalen. HARD deja que el nivel absoluto empuje más.", pt: "SOFT abaixa as ressonâncias na proporção do quanto se destacam. HARD deixa o nível absoluto empurrar mais." },
    "Monitors only what is being removed. If you hear words in here, lower DEPTH.": { es: "Monitoriza solo lo que se está quitando. Si oyes palabras aquí, baja DEPTH.", pt: "Monitora só o que está sendo removido. Se você ouvir palavras aqui, diminua o DEPTH." },
    "An oversampled tape stage with Character, Steady, Focus and Tube: harmonics, gentle squash and density, without touching the words.":
      { es: "Una etapa de cinta con sobremuestreo y Character, Steady, Focus y Tube: armónicos, compresión suave y densidad, sin tocar las palabras.",
        pt: "Um estágio de fita com oversampling e Character, Steady, Focus e Tube: harmônicos, squash suave e densidade, sem tocar nas palavras." },
    "Drive pushes the vocal into a tape model running at four times the sample rate, so the harmonics are clean rather than aliased. Character moves from velvet, a soft tube-like curve that is almost all second harmonic, to crunch, a hard knee with odd harmonics. Speed sets the head bump and the high-frequency roll-off together: 7.5 is thick and dark, 30 is clean and wide. Auto gain keeps the loudness where it was, so turning up drive adds colour, not volume.":
      { es: "Drive empuja la voz a un modelo de cinta que trabaja a cuatro veces la frecuencia de muestreo, así que los armónicos son limpios y sin aliasing. Character va de velvet, una curva suave tipo válvula casi toda de segundo armónico, a crunch, una rodilla dura con armónicos impares. Speed ajusta a la vez el head bump y la caída de agudos: 7,5 es denso y oscuro, 30 es limpio y amplio. El auto gain mantiene la sonoridad donde estaba, así que subir el drive añade color, no volumen.",
        pt: "Drive empurra o vocal para um modelo de fita rodando a quatro vezes a taxa de amostragem, então os harmônicos são limpos e sem aliasing. Character vai de velvet, uma curva suave tipo válvula quase toda de segundo harmônico, a crunch, um joelho duro com harmônicos ímpares. Speed ajusta juntos o head bump e a queda de agudos: 7,5 é denso e escuro, 30 é limpo e amplo. O auto gain mantém o loudness onde estava, então subir o drive adiciona cor, não volume." },
    "Steady is the difference. At 100 a quiet verse gets exactly the same harmonics as a loud chorus, measured at the same distortion figure across a 24 dB range of input, with the level left untouched. Focus band-limits where the warmth is made, so the sub and the air pass around the tape and you can push drive without fizz. A transient guard lets consonants through cleaner than vowels, and the dry path is delay-matched to the wet, so any mix setting is phase-safe.":
      { es: "Steady marca la diferencia. A 100, una estrofa suave recibe exactamente los mismos armónicos que un estribillo fuerte, medidos con la misma cifra de distorsión en un rango de entrada de 24 dB, con el nivel intacto. Focus limita la banda donde se genera la calidez, así que el sub y el aire pasan de largo y puedes subir el drive sin siseo. Un guardián de transitorios deja pasar las consonantes más limpias que las vocales, y la señal seca está alineada en tiempo con la procesada, así que cualquier ajuste de mix es seguro en fase.",
        pt: "Steady faz a diferença. Em 100, um verso baixo recebe exatamente os mesmos harmônicos de um refrão alto, medidos com o mesmo índice de distorção em uma faixa de 24 dB de entrada, com o nível intacto. Focus limita a banda onde o calor é gerado, então o sub e o ar passam por fora e você pode subir o drive sem chiado. Um guarda de transientes deixa as consoantes passarem mais limpas que as vogais, e o sinal seco está alinhado no tempo com o processado, então qualquer ajuste de mix é seguro em fase." },
    "How hard the signal hits the tape, 0 to +24 dB. Harmonics, high-frequency squash and low-end density all grow with it. Auto gain keeps the volume steady.": { es: "Con qué fuerza la señal golpea la cinta, de 0 a +24 dB. Armónicos, compresión de agudos y densidad de graves crecen con él. El auto gain mantiene el volumen estable.", pt: "Com que força o sinal bate na fita, de 0 a +24 dB. Harmônicos, squash de agudos e densidade de graves crescem com ele. O auto gain mantém o volume estável." },
    "Velvet on the left: a soft curve biased like a class-A tube, almost all second harmonic, warm and round. Crunch on the right: a hard knee, odd harmonics, hotter and edgier.": { es: "Velvet a la izquierda: una curva suave polarizada como una válvula clase A, casi todo segundo armónico, cálida y redonda. Crunch a la derecha: rodilla dura, armónicos impares, más caliente y afilado.", pt: "Velvet à esquerda: uma curva suave polarizada como uma válvula classe A, quase todo segundo harmônico, quente e redonda. Crunch à direita: joelho duro, harmônicos ímpares, mais quente e afiado." },
    "How much the warmth ignores your level. At 0 quiet passages stay clean and loud ones saturate. At 100 a quiet verse gets exactly the same harmonics as a loud chorus, with the level left untouched.": { es: "Cuánto ignora la calidez tu nivel. A 0 los pasajes suaves quedan limpios y los fuertes saturan. A 100 una estrofa suave recibe exactamente los mismos armónicos que un estribillo fuerte, con el nivel intacto.", pt: "Quanto o calor ignora o seu nível. Em 0, passagens baixas ficam limpas e as altas saturam. Em 100, um verso baixo recebe exatamente os mesmos harmônicos de um refrão alto, com o nível intacto." },
    "Where the warmth is made. At 0 the whole band is driven; turning up narrows it toward the body of the voice, so the sub and the air pass around the tape untouched.": { es: "Dónde se genera la calidez. A 0 se satura toda la banda; al subir se estrecha hacia el cuerpo de la voz, así que el sub y el aire pasan de largo intactos.", pt: "Onde o calor é gerado. Em 0 toda a banda é saturada; ao subir, estreita rumo ao corpo da voz, então o sub e o ar passam por fora intactos." },
    "A soft tube stage in front of the tape, mostly second harmonic. Two gentle stages in series give a layered density one curve cannot; it never changes the level.": { es: "Una etapa de válvula suave delante de la cinta, sobre todo segundo armónico. Dos etapas suaves en serie dan una densidad en capas que una sola curva no puede; nunca cambia el nivel.", pt: "Um estágio de válvula suave antes da fita, sobretudo segundo harmônico. Dois estágios suaves em série dão uma densidade em camadas que uma curva só não consegue; nunca muda o nível." },
    "Tape speed. Moves the head bump, the high-frequency loss and where the top starts to saturate together. 7.5 is thick and dark, 30 is clean and wide.": { es: "Velocidad de cinta. Mueve a la vez el head bump, la pérdida de agudos y dónde empieza a saturar el brillo. 7,5 es denso y oscuro, 30 es limpio y amplio.", pt: "Velocidade da fita. Move juntos o head bump, a perda de agudos e onde o brilho começa a saturar. 7,5 é denso e escuro, 30 é limpo e amplo." },
    "Parallel blend of dry and tape. Phase-aligned, so any setting is safe.": { es: "Mezcla en paralelo de seco y cinta. Alineada en fase, así que cualquier ajuste es seguro.", pt: "Mistura em paralelo de seco e fita. Alinhada em fase, então qualquer ajuste é seguro." },
    "An adaptive de-esser with no attack, no release and no threshold to babysit.":
      { es: "Un de-esser adaptativo sin ataque, sin release y sin umbral que vigilar.",
        pt: "Um de-esser adaptativo sem attack, sem release e sem threshold para vigiar." },
    "A sibilance detector looks 10 ms ahead of the audio and only opens on the spectral signature of an ess or an affricate, never on a loud dark vowel. The threshold adapts to the performance and freezes during silence and during sibilance itself, so a quiet verse and a loud chorus are de-essed to the same degree. Range sets the most an ess can be turned down; Split dips only the sibilant band and leaves the body alone.":
      { es: "Un detector de sibilancia mira 10 ms por delante del audio y solo se abre ante la firma espectral de una ese o una africada, nunca ante una vocal oscura fuerte. El umbral se adapta a la interpretación y se congela en el silencio y durante la propia sibilancia, así que una estrofa suave y un estribillo fuerte se procesan en la misma medida. Range fija lo máximo que puede bajar una ese; Split atenúa solo la banda sibilante y deja el cuerpo en paz.",
        pt: "Um detector de sibilância olha 10 ms à frente do áudio e só abre na assinatura espectral de um esse ou uma africada, nunca em uma vogal escura alta. O threshold se adapta à performance e congela no silêncio e durante a própria sibilância, então um verso baixo e um refrão alto são processados na mesma medida. Range define o máximo que um esse pode baixar; Split abaixa só a banda sibilante e deixa o corpo em paz." },
    "Most de-essers are compressors with a filter in front, and they lisp when pushed. This one approaches the range asymptotically, so loud esses stay proportionally louder than quiet ones and nothing ever goes dead. The lookahead catches the first millisecond of every ess. Air Link feeds its activity to the EQ, lifting the air shelf by up to 3 dB as it works, so taming sibilance no longer dulls the top.":
      { es: "La mayoría de de-essers son compresores con un filtro delante, y cecean cuando se aprietan. Este se acerca al rango de forma asintótica, así que las eses fuertes siguen siendo proporcionalmente más fuertes que las suaves y nada queda muerto. La anticipación atrapa el primer milisegundo de cada ese. Air Link envía su actividad al EQ, levantando el shelf de aire hasta 3 dB mientras trabaja, así que domar la sibilancia ya no apaga el brillo.",
        pt: "A maioria dos de-essers é um compressor com um filtro na frente, e eles ceceiam quando apertados. Este se aproxima do range de forma assintótica, então esses altos continuam proporcionalmente mais altos que os baixos e nada fica morto. O lookahead pega o primeiro milissegundo de cada esse. O Air Link envia sua atividade ao EQ, levantando o shelf de ar em até 3 dB enquanto trabalha, então domar a sibilância não apaga mais o brilho." },
    "Where the detector listens for sibilance. 5 to 7 kHz suits most voices.": { es: "Dónde escucha el detector la sibilancia. De 5 a 7 kHz va bien para la mayoría de voces.", pt: "Onde o detector escuta a sibilância. De 5 a 7 kHz serve para a maioria das vozes." },
    "HIPASS listens to everything above the frequency. BAND targets a single ess region for surgical work.": { es: "HIPASS escucha todo por encima de la frecuencia. BAND apunta a una sola región de ese para trabajo quirúrgico.", pt: "HIPASS escuta tudo acima da frequência. BAND mira uma única região de esse para trabalho cirúrgico." },
    "Biases the adaptive threshold. Positive catches more esses, negative fewer. There are no attack or release knobs: it only reacts to sibilance, never to loud dark vowels.": { es: "Desplaza el umbral adaptativo. Positivo atrapa más eses, negativo menos. No hay mandos de ataque ni release: solo reacciona a la sibilancia, nunca a vocales oscuras fuertes.", pt: "Desloca o threshold adaptativo. Positivo pega mais esses, negativo menos. Não há knobs de attack nem release: ele só reage à sibilância, nunca a vogais escuras altas." },
    "The most an ess can be turned down. Loud esses stay proportionally louder than quiet ones, so nothing sounds lisped.": { es: "Lo máximo que puede bajar una ese. Las eses fuertes siguen siendo proporcionalmente más fuertes que las suaves, así que nada suena ceceado.", pt: "O máximo que um esse pode baixar. Esses altos continuam proporcionalmente mais altos que os baixos, então nada soa ceceado." },
    "WIDE turns the whole signal down during an ess. SPLIT dips only the sibilant band and leaves the body alone.": { es: "WIDE baja toda la señal durante una ese. SPLIT atenúa solo la banda sibilante y deja el cuerpo en paz.", pt: "WIDE abaixa todo o sinal durante um esse. SPLIT abaixa só a banda sibilante e deixa o corpo em paz." },
    "How much de-esser activity lifts the EQ's air shelf, up to +3 dB. Taming esses no longer dulls the top.": { es: "Cuánto levanta la actividad del de-esser el shelf de aire del EQ, hasta +3 dB. Domar las eses ya no apaga el brillo.", pt: "Quanto a atividade do de-esser levanta o shelf de ar do EQ, até +3 dB. Domar os esses não apaga mais o brilho." },
    "A twelve-band equaliser with ten shapes, cut slopes to 96 dB per octave and dynamics on any band.":
      { es: "Un ecualizador de doce bandas con diez formas, pendientes de corte hasta 96 dB por octava y dinámica en cualquier banda.",
        pt: "Um equalizador de doze bandas com dez formas, slopes de corte até 96 dB por oitava e dinâmica em qualquer banda." },
    "Bells, shelves, cuts, notches, tilt and all-pass shapes, each with its own power, solo and dynamic mode. Dynamic bands compress or expand only their own region, with a band-limited detector and an anti-pump release. Click on the curve to create a band where you point. Scale drags every band's gain at once, from flat to double, so a preset can be dialled back without redrawing it.":
      { es: "Campanas, shelves, cortes, notches, tilt y formas paso-todo, cada una con su propio encendido, solo y modo dinámico. Las bandas dinámicas comprimen o expanden solo su región, con un detector limitado en banda y un release antibombeo. Haz clic en la curva para crear una banda donde señales. Scale arrastra la ganancia de todas las bandas a la vez, de plano a doble, así que un preset se puede suavizar sin redibujarlo.",
        pt: "Sinos, shelves, cortes, notches, tilt e formas passa-tudo, cada uma com o próprio liga/desliga, solo e modo dinâmico. Bandas dinâmicas comprimem ou expandem só a própria região, com um detector limitado em banda e um release antibombeamento. Clique na curva para criar uma banda onde apontar. Scale arrasta o ganho de todas as bandas de uma vez, de plano a dobro, então um preset pode ser suavizado sem redesenhar." },
    "The filter mathematics is calibrated so the drawn curve is the curve you hear, with the frequency response verified against a professional reference equaliser. Analog Phase mode matches the phase of the analogue curve as well as its magnitude, with no pre-ringing and zero latency. Any structural change, a band switched on, a shape changed, a slope moved, crossfades in ten milliseconds, so the EQ can be adjusted while the singer is performing.":
      { es: "Las matemáticas de los filtros están calibradas para que la curva dibujada sea la que oyes, con la respuesta en frecuencia verificada frente a un ecualizador de referencia profesional. El modo Analog Phase iguala la fase de la curva analógica además de su magnitud, sin pre-ringing y con latencia cero. Cualquier cambio estructural, una banda encendida, una forma cambiada, una pendiente movida, hace un crossfade en diez milisegundos, así que el EQ se puede ajustar mientras canta el vocalista.",
        pt: "A matemática dos filtros é calibrada para que a curva desenhada seja a curva que você ouve, com a resposta em frequência verificada contra um equalizador de referência profissional. O modo Analog Phase iguala a fase da curva analógica além da magnitude, sem pré-ringing e com latência zero. Qualquer mudança estrutural, uma banda ligada, uma forma trocada, um slope movido, faz crossfade em dez milissegundos, então o EQ pode ser ajustado enquanto o vocalista canta." },
    "Frequency, gain and Q per band, ten shapes, cut slopes from 6 to 96 dB per octave. Double-click a band to switch it off; solo auditions just that band.": { es: "Frecuencia, ganancia y Q por banda, diez formas, pendientes de corte de 6 a 96 dB por octava. Doble clic en una banda para apagarla; solo escucha solo esa banda.", pt: "Frequência, ganho e Q por banda, dez formas, slopes de corte de 6 a 96 dB por oitava. Clique duplo em uma banda para desligá-la; solo escuta só aquela banda." },
    "Per-band dynamics: the band only moves when its own region gets loud, compressing or expanding by the range you set.": { es: "Dinámica por banda: la banda solo se mueve cuando su propia región sube, comprimiendo o expandiendo el rango que fijes.", pt: "Dinâmica por banda: a banda só se move quando a própria região fica alta, comprimindo ou expandindo pelo range que você define." },
    "Scales every band's gain at once: 100% as drawn, 0% flat, 200% double.": { es: "Escala la ganancia de todas las bandas a la vez: 100% como está dibujado, 0% plano, 200% doble.", pt: "Escala o ganho de todas as bandas de uma vez: 100% como desenhado, 0% plano, 200% dobro." },
    "Zero Latency matches the analogue magnitude curve. Analog Phase also matches the analogue phase, with no pre-ringing.": { es: "Zero Latency iguala la curva de magnitud analógica. Analog Phase iguala también la fase analógica, sin pre-ringing.", pt: "Zero Latency iguala a curva de magnitude analógica. Analog Phase iguala também a fase analógica, sem pré-ringing." },
    "Spectrum display: off, before the EQ, after it, or both, with a freeze for reading it.": { es: "Analizador de espectro: apagado, antes del EQ, después o ambos, con congelado para leerlo.", pt: "Analisador de espectro: desligado, antes do EQ, depois ou ambos, com congelamento para ler." },
    "A FET compressor in the classic fast style: a fixed threshold, an input you drive into it and ratios you punch in.":
      { es: "Un compresor FET del estilo rápido clásico: umbral fijo, una entrada que empujas contra él y ratios que se pulsan.",
        pt: "Um compressor FET no estilo rápido clássico: threshold fixo, uma entrada que você empurra contra ele e ratios que se apertam." },
    "The detector sits after the gain stage, in a feedback loop, so it behaves like the hardware: more input means more compression, attack runs down to 20 microseconds, and release is programme-dependent, letting a sustained squash go more slowly than a brief peak. Ratios of 4, 8, 12 and 20 to 1, plus the all-buttons mode with its plateau curve and bite. Output is compensated automatically, so presets carry across levels.":
      { es: "El detector está después de la etapa de ganancia, en un lazo de realimentación, así que se comporta como el hardware: más entrada significa más compresión, el ataque baja hasta 20 microsegundos y el release depende del programa, soltando más despacio una compresión sostenida que un pico breve. Ratios de 4, 8, 12 y 20 a 1, más el modo de todos los botones con su curva en meseta y su mordida. La salida se compensa automáticamente, así que los presets funcionan a cualquier nivel.",
        pt: "O detector fica depois do estágio de ganho, em um loop de realimentação, então se comporta como o hardware: mais entrada significa mais compressão, o attack desce até 20 microssegundos e o release depende do programa, soltando mais devagar um squash sustentado do que um pico breve. Ratios de 4, 8, 12 e 20 para 1, mais o modo de todos os botões com sua curva em platô e sua mordida. A saída é compensada automaticamente, então os presets funcionam em qualquer nível." },
    "The coloration follows the gain reduction the way a real FET stage does, odd-dominant and growing as you push it, instead of being a static saturation bolted on afterwards. The ratio buttons couple slope, threshold and knee together as one system, so each setting has its own character rather than being a number. Auto gain keeps the level honest while you find the sound.":
      { es: "La coloración sigue la reducción de ganancia como en una etapa FET real, dominada por impares y creciendo al apretar, en lugar de ser una saturación estática añadida después. Los botones de ratio acoplan pendiente, umbral y rodilla como un solo sistema, así que cada ajuste tiene su propio carácter en lugar de ser un número. El auto gain mantiene el nivel honesto mientras encuentras el sonido.",
        pt: "A coloração segue a redução de ganho como em um estágio FET real, dominada por ímpares e crescendo conforme você aperta, em vez de ser uma saturação estática colada depois. Os botões de ratio acoplam slope, threshold e joelho como um sistema só, então cada ajuste tem o próprio caráter em vez de ser um número. O auto gain mantém o nível honesto enquanto você acha o som." },
    "Drive into the FET compressor. The threshold is fixed like the hardware, so more input means more compression. Output is compensated automatically.": { es: "Entrada al compresor FET. El umbral es fijo como en el hardware, así que más entrada significa más compresión. La salida se compensa automáticamente.", pt: "Entrada no compressor FET. O threshold é fixo como no hardware, então mais entrada significa mais compressão. A saída é compensada automaticamente." },
    "4, 8, 12 or 20 to 1, or ALL: every button in, the aggressive all-buttons shape.": { es: "4, 8, 12 o 20 a 1, o ALL: todos los botones pulsados, la forma agresiva.", pt: "4, 8, 12 ou 20 para 1, ou ALL: todos os botões apertados, a forma agressiva." },
    "1 to 7, hardware style: 7 is the fastest, 20 microseconds.": { es: "De 1 a 7, al estilo del hardware: 7 es el más rápido, 20 microsegundos.", pt: "De 1 a 7, no estilo do hardware: 7 é o mais rápido, 20 microssegundos." },
    "1 to 7, 7 fastest. Programme dependent: a sustained squash lets go more slowly than a brief peak.": { es: "De 1 a 7, 7 el más rápido. Depende del programa: una compresión sostenida se suelta más despacio que un pico breve.", pt: "De 1 a 7, 7 o mais rápido. Depende do programa: um squash sustentado solta mais devagar que um pico breve." },
    "Compensates the input drive so the level stays honest as you push it.": { es: "Compensa la entrada para que el nivel se mantenga honesto mientras aprietas.", pt: "Compensa a entrada para o nível ficar honesto enquanto você aperta." },
    "Parallel blend of compressed and dry.": { es: "Mezcla en paralelo de comprimido y seco.", pt: "Mistura em paralelo de comprimido e seco." },
    "An optical leveller after the catch, modelled on the classic two-knob studio compressor.":
      { es: "Un nivelador óptico después del catch, modelado a partir del clásico compresor de estudio de dos mandos.",
        pt: "Um nivelador óptico depois do catch, modelado a partir do clássico compressor de estúdio de dois knobs." },
    "Peak Reduction sets how much the performance is levelled. A light-dependent cell model gives programme-dependent attack and a two-stage release that recovers half quickly and the rest slowly, following the last several seconds of the performance. Compress is a gentle 3 to 1; Limit is near-hard for catching peaks. Emphasis makes the detector more sensitive to brightness, so harsh moments trigger levelling sooner. Tube colour sits outside the loop, level-tracked.":
      { es: "Peak Reduction fija cuánto se nivela la interpretación. Un modelo de célula fotosensible da un ataque dependiente del programa y un release en dos etapas que recupera la mitad rápido y el resto despacio, siguiendo los últimos segundos de la interpretación. Compress es un suave 3 a 1; Limit es casi duro para atrapar picos. Emphasis hace el detector más sensible al brillo, así que los momentos ásperos disparan la nivelación antes. El color de válvula queda fuera del lazo, siguiendo el nivel.",
        pt: "Peak Reduction define quanto a performance é nivelada. Um modelo de célula fotossensível dá um attack dependente do programa e um release em dois estágios que recupera metade rápido e o resto devagar, seguindo os últimos segundos da performance. Compress é um suave 3 para 1; Limit é quase duro para segurar picos. Emphasis deixa o detector mais sensível ao brilho, então momentos ásperos disparam o nivelamento antes. A cor de válvula fica fora do loop, seguindo o nível." },
    "This is the stage that keeps the vocal in the mix without anyone hearing it work. The release memory means a long phrase and a short shout are treated differently, the way the original hardware does it, and consonants pass through untouched. With the fast compressor catching peaks in front of it, Level only ever has to do the gentle part.":
      { es: "Esta es la etapa que mantiene la voz en la mezcla sin que nadie la oiga trabajar. La memoria del release hace que una frase larga y un grito corto se traten de forma distinta, como lo hace el hardware original, y las consonantes pasan intactas. Con el compresor rápido atrapando picos delante, Level solo tiene que hacer la parte suave.",
        pt: "Este é o estágio que mantém o vocal na mix sem ninguém ouvir trabalhando. A memória do release faz uma frase longa e um grito curto serem tratados de forma diferente, como o hardware original faz, e as consoantes passam intactas. Com o compressor rápido segurando picos na frente, o Level só precisa fazer a parte suave." },
    "How much the opto compressor levels the performance. Slow, smooth, and it stays out of the way of consonants.": { es: "Cuánto nivela el compresor óptico la interpretación. Lento, suave, y no se mete con las consonantes.", pt: "Quanto o compressor óptico nivela a performance. Lento, suave, e não atrapalha as consoantes." },
    "COMPRESS is gentle, about 3 to 1. LIMIT is near-hard for catching peaks.": { es: "COMPRESS es suave, unos 3 a 1. LIMIT es casi duro para atrapar picos.", pt: "COMPRESS é suave, uns 3 para 1. LIMIT é quase duro para segurar picos." },
    "Makes the detector more sensitive to highs, so brightness triggers levelling sooner.": { es: "Hace el detector más sensible a los agudos, así que el brillo dispara la nivelación antes.", pt: "Deixa o detector mais sensível aos agudos, então o brilho dispara o nivelamento antes." },
    "Make-up gain after levelling.": { es: "Ganancia de compensación tras la nivelación.", pt: "Ganho de compensação depois do nivelamento." },
    "Compensates the levelling so loudness stays where it was.": { es: "Compensa la nivelación para que la sonoridad se quede donde estaba.", pt: "Compensa o nivelamento para o loudness ficar onde estava." },
    "Parallel blend of levelled and dry.": { es: "Mezcla en paralelo de nivelado y seco.", pt: "Mistura em paralelo de nivelado e seco." },
  };

  /* ---------- markup blocks (selector -> innerHTML; array = per match) --- */
  var HTML = [
    { sel: ".hero-line",
      es: "Viste el <span class=\"em\">problema</span>.",
      pt: "Vista o <span class=\"em\">problema</span>." },
    { sel: ".strip-line",
      es: "Nos fuimos — país, familia, el plan <span class=\"em\">sensato</span> — para crear cosas y ver el mundo. Esta es la ropa que salió de eso.",
      pt: "Fomos embora — país, família, o plano <span class=\"em\">sensato</span> — para criar coisas e ver o mundo. Esta é a roupa que saiu disso." },
    { sel: ".cm-track span",
      es: "Sé un bad <span class=\"em\">scandal</span> —&nbsp;",
      pt: "Seja um bad <span class=\"em\">scandal</span> —&nbsp;" },
    { sel: ".music-line",
      es: "Música a la que le da <span class=\"em\">igual</span>.",
      pt: "Música que não está nem <span class=\"em\">aí</span>." },
    { sel: ".plug-line",
      es: "La cadena vocal todo en uno, hecha por <span class=\"em\">ingenieros</span>.",
      pt: "A cadeia vocal tudo-em-um, feita por <span class=\"em\">engenheiros</span>." },
    { sel: ".about-lead", es: [
        "<b>BADSCANDAL es el alias de Luke Power</b> — primero fue la música, y todo lo demás creció de ahí. También es una forma de vivir: hacer las cosas que alborotan a la gente, en voz alta, delante de todos.",
        "Nos fuimos. País, familia, amigos, toda la estructura — cambiados por el sueño de crear cosas y ver el mundo. Lo llevamos entre los dos, Luke y Lilian. <b>Di lo que nadie dice.</b>"
      ], pt: [
        "<b>BADSCANDAL é o alias de Luke Power</b> — primeiro veio a música, e todo o resto cresceu daí. Também é um jeito de viver: fazer as coisas que causam alvoroço, em voz alta, na frente de todo mundo.",
        "Fomos embora. País, família, amigos, a estrutura toda — trocados pelo sonho de criar coisas e ver o mundo. Tocado por nós dois, Luke e Lilian. <b>Diga o que ninguém diz.</b>"
      ] },
    { sel: ".about-sec .prose p", es: [
        "Esa es toda la asignación. Si tienes treinta, ya gastaste unas mil quinientas. Nadie lo menciona, porque una persona que hizo la cuenta es mucho más difícil de mantener en fila.",
        "Todos tendrán algo que decir. Demasiado rápido, demasiado loco, demasiado, no es normal. Lo dijeron antes de ti y lo dirán después, y nada importará — nadie estudia la vida privada de Shakespeare. La obra sobrevivió al hombre y el chisme no sobrevivió al siglo. <b>El tuyo tampoco.</b>",
        "La sociedad está construida para que todo funcione sin fricción, no para llevarte a donde quieres ir. Trabajo, renta, repetir — y la mayoría nunca sale por la puerta. Si no estás rompiendo la ley, no hay problema. Nunca hubo un problema.",
        "<b>BADSCANDAL va de convertirse en uno.</b> Un bad scandal es lo que te llaman cuando dejas de pedir permiso. Es para la gente que se preocupó demasiado, salió lastimada, y del otro lado entendió que nada importa de verdad excepto el momento en el que estás parado.",
        "Aquí todos son bienvenidos — toda raza, todo sexo, toda orientación. La meta es superar el miedo a ser juzgado y vivir con honestidad desde un lugar de que no te importe una <span class=\"bs-swear\">f***</span>. La ropa es la declaración. Síguenos por el mundo.",
        "Mayoreo, prensa y todo lo demás: <a href=\"mailto:contact@badscandal.com\">contact@badscandal.com</a>"
      ], pt: [
        "Essa é a cota inteira. Se você tem trinta, já gastou umas mil e quinhentas. Ninguém fala disso, porque uma pessoa que fez essa conta é bem mais difícil de manter na linha.",
        "Todo mundo vai ter algo a dizer. Rápido demais, louco demais, demais, não é normal. Falaram antes de você e vão falar depois, e nada disso vai importar — ninguém estuda a vida privada de Shakespeare. A obra sobreviveu ao homem e a fofoca não sobreviveu ao século. <b>A sua também não vai.</b>",
        "A sociedade foi construída pra tudo rodar liso, não pra te levar aonde você quer ir. Trabalho, aluguel, repete — e a maioria nunca sai pela porta. Se você não está quebrando a lei, não tem problema. Nunca teve.",
        "<b>BADSCANDAL é sobre virar um.</b> Um bad scandal é como te chamam quando você para de pedir permissão. É pra quem se importou demais, se machucou nisso, e saiu do outro lado entendendo que nada importa de verdade além do momento em que você está.",
        "Todo mundo é bem-vindo aqui — toda raça, todo sexo, toda orientação. A meta é superar o medo do julgamento e viver com honestidade a partir de um lugar de não dar a mínima <span class=\"bs-swear\">f***</span>. A roupa é a declaração. Siga a gente pelo mundo.",
        "Atacado, imprensa e todo o resto: <a href=\"mailto:contact@badscandal.com\">contact@badscandal.com</a>"
      ] },
    { sel: ".page-head h1",
      es: "Nos <span class=\"em\">fuimos</span>.",
      pt: "Fomos <span class=\"em\">embora</span>." },
    { sel: ".page-head .lede",
      es: "País, familia, amigos, toda la estructura — cambiados por el sueño de crear cosas y ver el mundo. <b>BADSCANDAL es la ropa que salió de eso.</b>",
      pt: "País, família, amigos, a estrutura toda — trocados pelo sonho de criar coisas e ver o mundo. <b>BADSCANDAL é a roupa que saiu disso.</b>" },
    { sel: "#story-prose p", es: [
        "Nos conocimos y nos enamoramos vergonzosamente rápido, y en medio de eso descubrimos que queríamos la misma cosa irrazonable: irnos, y crear cosas sobre irnos. Así que nos fuimos. No un año sabático, no con fecha de vuelta — irnos de verdad, con toda la gente que queremos mirando y formándose una opinión en silencio.",
        "Todos tenían algo que decir. Demasiado rápido. Demasiado loco. Demasiado pronto. Que qué pasa con un trabajo de verdad, con la pensión, con cuando no funcione. Parte era cariño y parte era solo el ruido que hace la gente cuando haces algo que no creían permitido.",
        "Esto es lo que hizo fácil la decisión. <b>Tienes unas cuatro mil semanas.</b> Si tienes treinta, ya se gastaron como mil quinientas. Nadie lo menciona, porque una persona que hizo esa cuenta es mucho más difícil de mantener en fila.",
        "Y ninguna de las opiniones sobrevive. Nadie estudia la vida privada de Shakespeare — un puñado de académicos, y hasta ellos fichan la salida. Las obras sobrevivieron al hombre; el chisme no salió del siglo. Lo que cualquiera piense de cómo vives desaparecerá igual de completo, y mucho antes. Eso no es deprimente. Es el permiso.",
        "La sociedad no está construida para llevarte a donde quieres ir. Está construida para que todo siga funcionando, que es un objetivo distinto que casualmente requiere que te quedes quieto. Trabajo, renta, repetir — un bucle con una puerta que la mayoría nunca cruza. Y si no estás rompiendo la ley, nunca hubo problema. Solo había una sala llena de gente que decidió que lo había.",
        "<b>BADSCANDAL va de convertirse en uno.</b> Un bad scandal es lo que te llaman cuando dejas de pedir permiso. Empezamos la marca como una declaración para nosotros mismos de que de verdad lo estábamos haciendo — y resultó que otra gente también quería decirlo.",
        "Así que: síguenos por el mundo. Mira cómo funciona o mira cómo se cae. De cualquier manera valdrá la pena verlo."
      ], pt: [
        "Nos conhecemos e nos apaixonamos rápido de dar vergonha, e no meio disso descobrimos que queríamos a mesma coisa irracional: ir, e criar coisas sobre ir. Então fomos. Não um ano sabático, não com data de volta — ir de verdade, com todo mundo que amamos olhando e formando opinião em silêncio.",
        "Todo mundo tinha algo a dizer. Rápido demais. Louco demais. Cedo demais. E o emprego de verdade, e a aposentadoria, e quando não der certo. Parte era carinho e parte era só o barulho que as pessoas fazem quando você faz algo que elas achavam que não era permitido.",
        "Foi isso que tornou a decisão fácil. <b>Você tem umas quatro mil semanas.</b> Se você tem trinta, umas mil e quinhentas já se foram. Ninguém fala disso, porque uma pessoa que fez essa conta é bem mais difícil de manter na linha.",
        "E nenhuma das opiniões sobrevive. Ninguém estuda a vida privada de Shakespeare — meia dúzia de acadêmicos, e até eles batem o ponto. As peças sobreviveram ao homem; a fofoca não saiu do século. O que qualquer um pensa de como você vive vai sumir igualzinho, e bem antes. Isso não é sombrio. É a permissão.",
        "A sociedade não foi construída pra te levar aonde você quer ir. Foi construída pra tudo continuar rodando, que é um objetivo diferente que por acaso exige você parado. Trabalho, aluguel, repete — um loop com uma porta que a maioria nunca atravessa. E se você não está quebrando a lei, nunca teve problema. Só tinha uma sala cheia de gente que decidiu que tinha.",
        "<b>BADSCANDAL é sobre virar um.</b> Um bad scandal é como te chamam quando você para de pedir permissão. Começamos a marca como uma declaração pra nós mesmos de que estávamos mesmo fazendo isso — e aí descobrimos que outras pessoas também queriam dizer.",
        "Então: siga a gente pelo mundo. Veja funcionar ou veja desabar. De qualquer jeito vai valer a pena olhar."
      ] },
    { sel: ".scard-1 h3", es: "Dejamos el <span class=\"em\">plan</span> entero.", pt: "Largamos o <span class=\"em\">plano</span> inteiro." },
    { sel: ".scard-2 h3", es: "Casados sobre una <span class=\"em\">roca</span>.", pt: "Casados numa <span class=\"em\">rocha</span>." },
    { sel: ".scard-3 h3", es: "El camino se hizo <span class=\"em\">largo</span>.", pt: "A estrada ficou <span class=\"em\">longa</span>." },
    { sel: ".philo-word",
      es: "Tienes cuatro <br><span class=\"em\">mil</span> semanas.",
      pt: "Você tem quatro <br><span class=\"em\">mil</span> semanas." },
    { sel: ".philo-cols p", es: [
        "Eso es todo. Esa es la asignación completa, y buena parte de la tuya ya se fue. Nadie lo menciona, porque una persona que hizo la cuenta es mucho más difícil de mantener en fila.",
        "Así que nos fuimos — país, familia, amigos, la versión sensata del plan. Esta es la ropa que salió de eso: para perseguir lo que de verdad quieres, en voz alta, delante de todos."
      ], pt: [
        "É isso. Essa é a cota inteira, e boa parte da sua já se foi. Ninguém fala disso, porque uma pessoa que fez essa conta é bem mais difícil de manter na linha.",
        "Então fomos embora — país, família, amigos, a versão sensata do plano. Esta é a roupa que saiu disso: pra correr atrás do que você quer de verdade, em voz alta, na frente de todo mundo."
      ] },
    { sel: ".club h2",
      es: "¿Con ganas de unirte al <span class=\"em\">club</span>?",
      pt: "A fim de entrar no <span class=\"em\">clube</span>?" },
    { sel: ".faq h2",
      es: "Lo que deberías <span class=\"em\">saber</span>.",
      pt: "O que você deveria <span class=\"em\">saber</span>." },
    { sel: ".faq-list details p", es: [
        "Ser el bad scandal. Anarquía de la personal — expresarte libremente y ser tú, signifique lo que signifique para <b>ti</b>. No un títere, no un complaciente, no una versión tuya construida para la comodidad de otro.",
        "Luke y Lilian. Dejamos nuestro país para perseguir crear cosas y ver el mundo, y empezamos una marca de ropa como declaración a nosotros mismos de que lo estábamos haciendo de verdad. Estás en la página de la historia — está toda arriba.",
        "Las Declaraciones tienen algo que decir encima — esa es la mitad ruidosa del armario. Los Esenciales son los lisos y básicos con los que armas el resto. <a href=\"store.html\">Ambos están en la tienda</a>.",
        "No nos importa — estamos aquí para expresar. Si todo lo que haces es seguro para todos, no le dice nada a nadie. Si no estás rompiendo la ley, no hay problema.",
        "A todo el mundo. Los precios están en euros, y todo se hace por encargo — así que dale un poco más de tiempo del que le darías a una bodega."
      ], pt: [
        "Ser o bad scandal. Anarquia do tipo pessoal — se expressar livremente e ser você, seja lá o que isso significar para <b>você</b>. Não um fantoche, não um agrada-gente, não uma versão sua construída pro conforto dos outros.",
        "Luke e Lilian. Deixamos nosso país pra correr atrás de criar coisas e ver o mundo, e começamos uma marca de roupa como declaração pra nós mesmos de que estávamos mesmo fazendo. Você está na página da história — está tudo aí em cima.",
        "As Declarações têm algo a dizer estampado — essa é a metade barulhenta do guarda-roupa. Os Essenciais são os lisos e básicos com que você monta o resto. <a href=\"store.html\">Os dois estão na loja</a>.",
        "A gente não liga — estamos aqui pra expressar. Se tudo que você faz é seguro pra todo mundo, não diz nada a ninguém. Se você não está quebrando a lei, não tem problema.",
        "Pro mundo todo. Os preços são em euro, e tudo é feito sob demanda — então dá um tempinho a mais do que você daria pra um estoque." ] },
    { sel: "#wearit-prose p",
      es: "La ropa es la declaración — la mitad ruidosa en la espalda, donde la gente la lee cuando te vas. Di lo que nadie dice, o llévate la lisa y dilo en silencio.",
      pt: "A roupa é a declaração — a metade barulhenta nas costas, onde as pessoas leem quando você vai embora. Diga o que ninguém diz, ou leve a lisa e fale em silêncio." },
    { sel: ".store-hero-inner h1",
      es: "Viste el<br><span class=\"em\">problema</span>.",
      pt: "Vista o<br><span class=\"em\">problema</span>." },
    { sel: ".store-hero-inner .lede",
      es: "Declaraciones para decirlo en voz alta, esenciales para el resto de la semana. Hecho por encargo, enviado a todo el mundo — <b>en serio, o a la basura.</b>",
      pt: "Declarações pra dizer em voz alta, essenciais pro resto da semana. Feito sob demanda, enviado pro mundo todo — <b>falado sério, ou jogado fora.</b>" },
    /* ---------- plugin store (plugin.html) — added 5 Sep 2026 ---------- */
    { sel: ".plug-intro h2",
      es: "Ocho módulos. Una ventana. Hecho para la <span class=\"em\">voz</span>.",
      pt: "Oito módulos. Uma janela. Feito para a <span class=\"em\">voz</span>." },
    { sel: ".plug-cols > div > p", es: [
        "CLEANSLATE es una cadena vocal completa en el orden en que la usa una sesión profesional: supresión de ruido, limpieza, control espectral de resonancias, saturación de cinta, de-esser, un EQ quirúrgico y dos etapas de compresión, en una sola ventana con la señal fluyendo de arriba abajo.",
        "Cada módulo está modelado a partir de los compresores analógicos y procesadores espectrales que usan los ingenieros, y después afinado específicamente para voces en lugar de venderse como un efecto genérico. Spectral conoce las zonas donde una voz acumula resonancias y las busca en tu toma; si no encuentra nada, no quita nada. Los compresores, la supresión de ruido y el de-esser siguen el mismo principio: preparados para la voz, actuando solo cuando la voz lo pide, con cada parámetro todavía bajo tu control.",
        "Activa TRACK y la cadena baja a 10,7&nbsp;ms de latencia, así que el mismo procesado que termina una voz se puede cantar en directo."
      ], pt: [
        "O CLEANSLATE é uma cadeia vocal completa na ordem em que uma sessão profissional a usa: supressão de ruído, limpeza, controle espectral de ressonâncias, saturação de fita, de-esser, um EQ cirúrgico e dois estágios de compressão, em uma única janela com o sinal fluindo de cima para baixo.",
        "Cada módulo é modelado a partir dos compressores analógicos e processadores espectrais que os engenheiros usam, e depois ajustado especificamente para vocais em vez de vendido como um efeito genérico. O Spectral conhece as regiões onde uma voz acumula ressonância e procura por elas no seu take; se não encontra nada, não remove nada. Os compressores, a supressão de ruído e o de-esser seguem o mesmo princípio: preparados para a voz, agindo só quando a voz pede, com cada parâmetro ainda sob o seu controle.",
        "Ligue o TRACK e a cadeia cai para 10,7&nbsp;ms de latência, então o mesmo processamento que finaliza um vocal pode ser cantado ao vivo."
      ] },
    { sel: ".plug-mods h2",
      es: "Qué hay en la <span class=\"em\">cadena</span>.",
      pt: "O que tem na <span class=\"em\">cadeia</span>." },
    { sel: ".gal-lead h2",
      es: "Hecho por ingenieros y vocalistas, para ingenieros y <span class=\"em\">vocalistas</span>.",
      pt: "Feito por engenheiros e vocalistas, para engenheiros e <span class=\"em\">vocalistas</span>." },
    { sel: ".gal-specs h3",
      es: "Funciona en <span class=\"em\">todas partes</span>.",
      pt: "Roda em <span class=\"em\">tudo</span>." },
    { sel: ".plug-buy h2",
      es: "Consigue la <span class=\"em\">cadena</span>.",
      pt: "Pegue a <span class=\"em\">cadeia</span>." },
    { sel: "#plug-faq h2",
      es: "Lo que <span class=\"em\">preguntarías</span>.",
      pt: "O que você <span class=\"em\">perguntaria</span>." },
    { sel: "#plug-faq details:nth-of-type(4) p:last-child",
      es: "Ese plan lo marcan las personas que lo usan. Envía peticiones de funciones o informes de errores a <a href=\"mailto:contact@badscandal.com?subject=CLEANSLATE%20feedback\">contact@badscandal.com</a> y los atenderemos.",
      pt: "Esse roteiro é definido por quem usa o plugin. Mande pedidos de recursos ou relatos de bugs para <a href=\"mailto:contact@badscandal.com?subject=CLEANSLATE%20feedback\">contact@badscandal.com</a> e nós cuidamos disso." },
    /* ---------- plugin store: module detail headlines (5 Sep 2026) ---------- */
    { sel: "#md-noise h2",
      es: "Elimina la sala. Conserva la <span class=\"em\">toma</span>.",
      pt: "Elimina a sala. Mantém o <span class=\"em\">take</span>." },
    { sel: "#md-cleanup h2",
      es: "Retumbo y barro, fuera antes de que empiece el <span class=\"em\">tono</span>.",
      pt: "Rumble e lama, fora antes de o <span class=\"em\">tom</span> começar." },
    { sel: "#md-spectral h2",
      es: "Resonancias detectadas y talladas, <span class=\"em\">solo</span> cuando aparecen.",
      pt: "Ressonâncias encontradas e esculpidas, <span class=\"em\">só</span> quando aparecem." },
    { sel: "#md-tape h2",
      es: "Calidez que ignora tu <span class=\"em\">nivel</span>.",
      pt: "Calor que ignora o seu <span class=\"em\">nível</span>." },
    { sel: "#md-deess h2",
      es: "Atrapa la ese, nunca la <span class=\"em\">palabra</span>.",
      pt: "Pega o esse, nunca a <span class=\"em\">palavra</span>." },
    { sel: "#md-eq h2",
      es: "Doce bandas, <span class=\"em\">quirúrgicas</span> o amplias.",
      pt: "Doze bandas, <span class=\"em\">cirúrgicas</span> ou amplas." },
    { sel: "#md-catch h2",
      es: "El rápido. Picos atrapados, voz mantenida <span class=\"em\">delante</span>.",
      pt: "O rápido. Picos segurados, vocal mantido na <span class=\"em\">frente</span>." },
    { sel: "#md-level h2",
      es: "Lento, musical, <span class=\"em\">invisible</span>.",
      pt: "Lento, musical, <span class=\"em\">invisível</span>." },
  ];

  window.BS_LANG = lang;
  window.BS_T = function (s) {
    var e = TEXT[s];
    return (e && e[lang]) || s;
  };

  /* ---------- apply (runs immediately; this file loads at end of body) --- */
  if (lang !== "en") {
    document.documentElement.lang = lang;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = raw.trim();
      if (!key) continue;
      var entry = TEXT[key] || TEXT[key.replace(/\s+/g, " ")];
      if (!entry) {
        /* whitespace-collapsed match for wrapped source lines */
        entry = TEXT[Object.keys(TEXT).filter(function (k) {
          return k.replace(/\s+/g, " ") === key.replace(/\s+/g, " ");
        })[0]];
      }
      if (entry && entry[lang]) node.nodeValue = raw.replace(key, entry[lang]);
    }
    HTML.forEach(function (h) {
      var tr = h[lang];
      if (!tr) return;
      var els = document.querySelectorAll(h.sel);
      Array.prototype.forEach.call(els, function (el, i) {
        var v = Array.isArray(tr) ? tr[i] : tr;
        if (v) el.innerHTML = v;
      });
    });
  }

  /* ---------- switcher (the .lang buttons in the nav) -------------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".lang button"), function (b) {
    var l = b.getAttribute("data-lang");
    if (l === lang) b.classList.add("on");
    b.addEventListener("click", function () {
      if (l === lang) return;
      try { localStorage.setItem("bs_lang", l); } catch (e) {}
      location.reload();
    });
  });
})();
