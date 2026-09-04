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
    "Instant key by email · 3 machines · works offline": { es: "Clave al instante por email · 3 equipos · funciona sin conexión", pt: "Chave na hora por e-mail · 3 máquinas · funciona offline" },
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
        pt: "Drop de prévia — produtos demo. O estoque real chega quando a Shopify conectar." }
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
      es: "Voces que no se <span class=\"em\">inmutan</span>.",
      pt: "Vocais que não <span class=\"em\">vacilam</span>." },
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
      pt: "Declarações pra dizer em voz alta, essenciais pro resto da semana. Feito sob demanda, enviado pro mundo todo — <b>falado sério, ou jogado fora.</b>" }
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
