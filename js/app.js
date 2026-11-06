/* ==========================================================================
   AlertaBairro — aplicativo (solucao.html)
   Telas "Onde estou" (localização e risco) e "Rota de fuga" (destino seguro e rota em linha reta),
   navegação por hash, mapa próprio (js/mapa.js) e mapas incorporados (Google Maps), relatos, alertas
   simulados e configurações. Depende de js/main.js (namespace AB) e js/mapa.js. Sem biblioteca de mapas.
   Tudo é DEMONSTRATIVO: dados simulados, armazenamento no navegador (LocalStorage),
   nenhum envio real de SMS, WhatsApp, e-mail ou push.
   ========================================================================== */
'use strict';

(function () {
  if (!window.AB || !document.getElementById("app-root")) return;
  const { BAIRROS, LOCAIS_COBERTOS, STORAGE, $, $$, criarElemento: el, formatarNumero: fmt, normalizarTexto, lerJSON, salvarJSON } = window.AB;

  /* ---------- 1. Constantes ---------------------------------------------- */
  const VIEWS = {
    "onde-estou": "Onde estou",
    "fuga": "Rota de fuga",
    "monitoramento": "Monitoramento",
    "mapa": "Mapa inteligente",
    "ocorrencias": "Ocorrências",
    "alertas": "Alertas",
    "comunidade": "Comunidade",
    "configuracoes": "Configurações"
  };
  const TIPOS = {
    alagamento: "Alagamento", enchente: "Enchente", deslizamento: "Deslizamento",
    via_interditada: "Via interditada", acumulo_agua: "Acúmulo de água", outros: "Outro problema climático"
  };
  const GRAVIDADES = { baixa: "Baixa", media: "Média", alta: "Alta" };
  const STATUS = { aguardando: "Aguardando verificação", acompanhamento: "Em acompanhamento", resolvida: "Resolvida (segundo o relator)" };
  const NIVEIS_ALERTA = { informativo: "Informativo", atencao: "Atenção", elevado: "Risco elevado" };
  const RISCO_PARA_NIVEL = { Baixo: "informativo", Moderado: "atencao", Alto: "elevado" };
  const DISTANCIA_MAX_KM = 8;   // até esta distância de um bairro monitorado, o usuário é considerado "dentro" dele
  const DESTINO_MAX_KM = 40;    // destinos de fuga só são sugeridos até esta distância do usuário
  const LOCAL_ORIGEM = { gps: "Localização por GPS", bairro: "Bairro escolhido na lista", mapa: "Ponto marcado no mapa" };
  const RAIO_BAIRRO_M = { Baixo: 900, Moderado: 1200, Alto: 1500 }; // raio da área desenhada em volta de cada bairro
  const ICONES_TIPO = { alagamento: "droplet", enchente: "cloud-rain", deslizamento: "alert", via_interditada: "pin", acumulo_agua: "droplet", outros: "info" };

  // Modos "google" e "satelite": mapas incorporados por <iframe> (só um link). O modo "mapa" é o mapa próprio (js/mapa.js).
  // LARGURA_REF/ALTURA_REF são o tamanho de referência do quadro, usados para calcular o recorte do OpenStreetMap.
  const LARGURA_REF = 640, ALTURA_REF = 380;
  const googleEmbed = (f, tipo) => {
    const base = `https://www.google.com/maps?hl=pt-BR&t=${tipo}&z=${f.zoom}&output=embed`;
    if (f.consulta) return `${base}&q=${encodeURIComponent(f.consulta)}`; // pesquisa por nome: o Google contorna a área do bairro/cidade
    return f.pino ? `${base}&q=${f.lat},${f.lng}` : `${base}&ll=${f.lat},${f.lng}`;
  };
  const PROVEDORES = {
    google: { rotulo: "Google Maps", embed: (f) => googleEmbed(f, "m") },
    satelite: { rotulo: "Satélite (Google)", embed: (f) => googleEmbed(f, "k") }
  };

  /* ---------- 2. Estado --------------------------------------------------- */
  const state = {
    view: "onde-estou",
    local: null, // { lat, lng, origem: gps | bairro | mapa, precisao, bairroId, quando }: onde o usuário está
    fuga: { destino: "" }, // chave do destino escolhido ("bairro-7", "coberto-3"); vazio = o recomendado
    cidade: "",
    bairros: BAIRROS.map((b) => Object.assign({}, b)),
    ocorrencias: [],
    alertas: [],
    config: { nome: "", cidade: "", acompanhados: [] },
    base: "mapa", // mapa | google | satelite
    foco: { tipo: "geral", n: 0, mover: true }, // o que o mapa mostra: geral | bairro | ocorrencia | rascunho
    camadas: { bairros: true, ocorrencias: true },
    pick: false,
    rascunho: null, // { lat, lng } informado pelo usuário para o relato
    bairroSelecionado: null,
    filtroMon: { busca: "", risco: "" },
    filtroOcc: { bairro: "", tipo: "" },
    alertaBairro: ""
  };

  let mapaProp = null, mapaLocal = null, mapaFuga = null, contFoco = 0, ultimaChave = "";
  const seletoresLocal = [];

  /* ---------- 3. Utilitários --------------------------------------------- */
  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const bairroPorId = (id) => state.bairros.find((b) => b.id === Number(id));
  const classe = (risco) => risco.toLowerCase();
  const iniciais = (nome) => (nome.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("") || "V").toUpperCase();

  function icone(nome, extra) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `icon${extra ? " " + extra : ""}`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
    uso.setAttribute("href", `#i-${nome}`);
    svg.append(uso);
    return svg;
  }

  function botao(texto, cls, onClick, iconeNome) {
    const b = el("button", `btn ${cls}`);
    b.type = "button";
    if (iconeNome) b.append(icone(iconeNome));
    b.append(document.createTextNode(texto));
    b.addEventListener("click", onClick);
    return b;
  }

  function formatarDataHora(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function tempoRelativo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return "";
    const min = Math.round(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    return `há ${Math.round(h / 24)} d`;
  }

  function distanciaKm(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function bairrosVisiveis() {
    return state.cidade ? state.bairros.filter((b) => b.cidade === state.cidade) : state.bairros;
  }

  function ocorrenciasVisiveis() {
    const ids = new Set(bairrosVisiveis().map((b) => b.id));
    return state.ocorrencias.filter((o) => ids.has(o.bairroId));
  }

  function acompanhados() {
    return state.config.acompanhados.length ? state.config.acompanhados : state.bairros.map((b) => b.id);
  }

  function alertasRelevantes() {
    const ids = new Set(acompanhados());
    return state.alertas.filter((a) => ids.has(a.bairroId));
  }

  /* ---------- 4. Toasts --------------------------------------------------- */
  function toast(mensagem, tipo) {
    const area = $("#toasts");
    if (!area) return;
    const t = el("div", `toast${tipo ? " " + tipo : ""}`);
    t.append(icone(tipo === "erro" ? "alert" : "check"), el("span", "", mensagem));
    area.append(t);
    setTimeout(() => t.remove(), 4200);
  }

  /* ---------- 5. Persistência -------------------------------------------- */
  function salvarOcorrencias() { salvarJSON(STORAGE.ocorrencias, state.ocorrencias); }
  function salvarAlertas() { salvarJSON(STORAGE.alertas, state.alertas); }
  function salvarConfig() { salvarJSON(STORAGE.config, state.config); }
  function salvarChuva() {
    const mapaChuva = {};
    state.bairros.forEach((b) => { mapaChuva[b.id] = b.chuva; });
    salvarJSON(STORAGE.chuva, mapaChuva);
  }

  function atualizarRisco(b) { b.risco = window.AB.nivelPorChuva(b.chuva); }

  function criarOcorrenciasDemo() {
    const agora = Date.now();
    const modelo = [
      { tipo: "alagamento", bairroId: 3, gravidade: "media", min: 95, dLat: 0.004, dLng: -0.003, descricao: "Relato demonstrativo: água acumulada na avenida, trânsito lento nos dois sentidos." },
      { tipo: "deslizamento", bairroId: 2, gravidade: "alta", min: 240, dLat: 0.006, dLng: 0.004, descricao: "Relato demonstrativo: barranco cedeu perto de uma escadaria, moradores isolaram o local." },
      { tipo: "via_interditada", bairroId: 10, gravidade: "media", min: 40, dLat: -0.003, dLng: 0.005, descricao: "Relato demonstrativo: rua bloqueada por galhos e lama após a chuva da madrugada." },
      { tipo: "acumulo_agua", bairroId: 12, gravidade: "baixa", min: 600, dLat: 0.003, dLng: 0.002, descricao: "Relato demonstrativo: poças grandes na esquina, bueiro parece entupido." }
    ];
    return modelo.map((m) => {
      const b = BAIRROS.find((x) => x.id === m.bairroId);
      return { id: uid("occ"), tipo: m.tipo, descricao: m.descricao, bairroId: m.bairroId, lat: b.lat + m.dLat, lng: b.lng + m.dLng, data: new Date(agora - m.min * 60000).toISOString(), gravidade: m.gravidade, status: "aguardando", origem: "demonstrativo" };
    });
  }

  function mensagemAlerta(b, anterior) {
    const base = `Chuva simulada de ${fmt(b.chuva)} mm em ${b.nome} (${b.cidade}).`;
    if (anterior && anterior !== b.risco) return `${base} O nível passou de ${anterior} para ${b.risco}. ${b.orientacao}`;
    return `${base} ${b.orientacao}`;
  }

  function criarAlerta(b, anterior, lido) {
    const nivel = RISCO_PARA_NIVEL[b.risco];
    return { id: uid("alt"), bairroId: b.id, nivel, titulo: `${NIVEIS_ALERTA[nivel]}: ${b.nome}`, mensagem: mensagemAlerta(b, anterior), data: new Date().toISOString(), lido: !!lido, simulado: true };
  }

  function criarAlertasIniciais() {
    return state.bairros.filter((b) => b.risco !== "Baixo").map((b) => criarAlerta(b, null, false));
  }

  function carregarEstado() {
    const chuva = lerJSON(STORAGE.chuva, null);
    if (chuva && typeof chuva === "object") {
      state.bairros.forEach((b) => {
        const v = Number(chuva[b.id]);
        if (Number.isFinite(v) && v >= 0 && v <= 200) { b.chuva = v; atualizarRisco(b); }
      });
    }
    const occ = lerJSON(STORAGE.ocorrencias, null);
    state.ocorrencias = Array.isArray(occ) ? occ : criarOcorrenciasDemo();
    if (!Array.isArray(occ)) salvarOcorrencias();
    const alt = lerJSON(STORAGE.alertas, null);
    state.alertas = Array.isArray(alt) ? alt : criarAlertasIniciais();
    if (!Array.isArray(alt)) salvarAlertas();
    const cfg = lerJSON(STORAGE.config, null);
    if (cfg && typeof cfg === "object") {
      state.config = { nome: String(cfg.nome || ""), cidade: String(cfg.cidade || ""), acompanhados: Array.isArray(cfg.acompanhados) ? cfg.acompanhados.map(Number) : [] };
    }
    state.cidade = state.config.cidade;
    const loc = lerJSON(STORAGE.local, null);
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180) {
      state.local = { lat: loc.lat, lng: loc.lng, origem: LOCAL_ORIGEM[loc.origem] ? loc.origem : "mapa", precisao: Number(loc.precisao) || null, bairroId: Number(loc.bairroId) || null, quando: String(loc.quando || "") };
    }
  }

  /* ---------- 6. Roteamento ---------------------------------------------- */
  function viewDoHash() {
    const nome = location.hash.replace("#", "");
    if (nome === "visao-geral") return "onde-estou"; // endereço antigo
    return VIEWS[nome] ? nome : "onde-estou";
  }

  function irPara(view) {
    if (location.hash.replace("#", "") === view) rotear(false);
    else location.hash = view;
  }

  function rotear(foco) {
    state.view = viewDoHash();
    if (state.pick && state.view !== "mapa") cancelarSelecaoNoMapa(false);
    $$(".view").forEach((v) => { v.hidden = v.dataset.view !== state.view; });
    $$("[data-nav]").forEach((a) => {
      if (a.dataset.nav === state.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = `${VIEWS[state.view]} | AlertaBairro`;
    fecharSidebar();
    fecharNotificacoes();
    posicionarMapa();
    $("#btn-sos").hidden = state.view === "fuga"; // já está na tela de fuga
    if (state.view === "onde-estou") renderMapaLocal(true);
    if (state.view === "fuga") renderFuga(true);
    if (foco) {
      const titulo = $(`#view-${state.view} .view-head`);
      if (titulo) { titulo.setAttribute("tabindex", "-1"); titulo.focus({ preventScroll: true }); }
      window.scrollTo({ top: 0 });
    }
  }

  /* ---------- 7. Sidebar mobile, notificações e busca global ------------- */
  function abrirSidebar() {
    $("#sidebar").classList.add("aberto");
    $("#sidebar-overlay").hidden = false;
    $("#btn-menu").setAttribute("aria-expanded", "true");
    $("#sidebar-fechar").focus();
  }
  function fecharSidebar() {
    $("#sidebar").classList.remove("aberto");
    $("#sidebar-overlay").hidden = true;
    $("#btn-menu").setAttribute("aria-expanded", "false");
  }
  function fecharNotificacoes() {
    $("#painel-notificacoes").hidden = true;
    $("#btn-notificacoes").setAttribute("aria-expanded", "false");
  }

  function iniciarShell() {
    $("#btn-menu").addEventListener("click", abrirSidebar);
    $("#tab-menu").addEventListener("click", abrirSidebar);
    $("#sidebar-fechar").addEventListener("click", () => { fecharSidebar(); $("#btn-menu").focus(); });
    $("#sidebar-overlay").addEventListener("click", fecharSidebar);

    $("#btn-notificacoes").addEventListener("click", () => {
      const painel = $("#painel-notificacoes");
      painel.hidden = !painel.hidden;
      $("#btn-notificacoes").setAttribute("aria-expanded", String(!painel.hidden));
    });
    $("#notif-ler-todas").addEventListener("click", marcarTodasLidas);

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#painel-notificacoes, #btn-notificacoes")) fecharNotificacoes();
      if (!e.target.closest(".search-box")) $("#busca-resultados").hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#painel-notificacoes").hidden) { fecharNotificacoes(); $("#btn-notificacoes").focus(); }
      if ($("#sidebar").classList.contains("aberto")) { fecharSidebar(); $("#btn-menu").focus(); }
      if ($("#occ-picker") && !$("#occ-picker").hidden) fecharSeletorLocal();
      if (state.pick) cancelarSelecaoNoMapa(true);
      $("#busca-resultados").hidden = true;
    });

    $$("[data-ir]").forEach((a) => a.addEventListener("click", (e) => {
      if (a.dataset.ir) { e.preventDefault(); irPara(a.dataset.ir); }
    }));
    $("#btn-nova-ocorrencia").addEventListener("click", () => { irPara("ocorrencias"); setTimeout(() => $("#occ-tipo").focus(), 50); });

    // Seleção de localização (cidade)
    const sel = $("#sel-cidade");
    Array.from(new Set(BAIRROS.map((b) => b.cidade))).forEach((c) => {
      const o = el("option", "", c); o.value = c; sel.append(o);
    });
    sel.value = state.cidade;
    sel.addEventListener("change", () => {
      state.cidade = sel.value;
      toast(state.cidade ? `Localização: ${state.cidade}` : "Localização: todas as cidades");
      renderTudo();
      ajustarMapa();
    });

    // Busca global de bairros
    const campo = $("#busca-global");
    const resultados = $("#busca-resultados");
    function buscar() {
      const termo = normalizarTexto(campo.value);
      resultados.replaceChildren();
      if (!termo) { resultados.hidden = true; return; }
      const achados = bairrosVisiveis().filter((b) => normalizarTexto(b.nome).includes(termo) || normalizarTexto(b.cidade).includes(termo)).slice(0, 6);
      if (!achados.length) resultados.append(el("li", "search-empty", "Nenhum bairro encontrado."));
      achados.forEach((b) => {
        const li = el("li");
        const bt = el("button"); bt.type = "button";
        const txt = el("span"); txt.append(el("strong", "", b.nome), el("small", "", b.cidade));
        bt.append(txt, el("span", `badge badge-${classe(b.risco)}`, b.risco));
        bt.addEventListener("click", () => { campo.value = ""; resultados.hidden = true; focarBairro(b.id); });
        li.append(bt); resultados.append(li);
      });
      resultados.hidden = false;
    }
    campo.addEventListener("input", buscar);
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const primeiro = $("button", resultados); if (primeiro) primeiro.click(); }
      if (e.key === "ArrowDown") { const primeiro = $("button", resultados); if (primeiro) { e.preventDefault(); primeiro.focus(); } }
    });
    resultados.addEventListener("keydown", (e) => {
      const botoes = $$("button", resultados), i = botoes.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && botoes[i + 1]) { e.preventDefault(); botoes[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (botoes[i - 1] || campo).focus(); }
    });
  }

  function marcarTodasLidas() {
    state.alertas.forEach((a) => { a.lido = true; });
    salvarAlertas();
    renderAlertasUI();
    toast("Todos os alertas foram marcados como lidos.", "sucesso");
  }

  /* ---------- 8. Mapa (incorporado por iframe) --------------------------- */
  function detalhesBairro(b) {
    const box = el("div", "popup-box");
    box.append(el("span", `badge badge-${classe(b.risco)}`, `Risco ${b.risco}`), el("h3", "", b.nome), el("p", "muted", b.cidade));
    box.append(el("p", "", `Chuva simulada: ${fmt(b.chuva)} mm. Temperatura simulada: ${fmt(b.temperatura)} °C.`), el("p", "", b.orientacao));
    box.append(el("p", "muted", "Dado demonstrativo, não é alerta oficial."));
    const acoes = el("div", "popup-actions");
    acoes.append(botao("Registrar relato", "btn-primary btn-sm", () => { preencherBairroRelato(b.id); irPara("ocorrencias"); }),
                 botao("Ver alertas", "btn-secondary btn-sm", () => { state.alertaBairro = String(b.id); irPara("alertas"); renderAlertasView(); }));
    box.append(acoes);
    return box;
  }

  function detalhesOcorrencia(o) {
    const b = bairroPorId(o.bairroId);
    const box = el("div", "popup-box");
    box.append(el("span", `badge badge-${o.gravidade === "alta" ? "alto" : o.gravidade === "media" ? "moderado" : "baixo"}`, `Gravidade ${GRAVIDADES[o.gravidade].toLowerCase()}`));
    box.append(el("h3", "", TIPOS[o.tipo]), el("p", "muted", `${b ? b.nome : ""}, ${formatarDataHora(o.data)}`), el("p", "", o.descricao));
    box.append(el("p", "muted", "Relato comunitário não verificado. Não é confirmação oficial."));
    return box;
  }

  // Quadro que cobre todos os bairros visíveis (ou a cidade escolhida), sem pino.
  function focoGeral() {
    const pts = bairrosVisiveis();
    if (!pts.length) return { tipo: "geral", lat: -14.235, lng: -51.925, zoom: 4, pino: false, rotulo: "Brasil" };
    const lats = pts.map((b) => b.lat), lngs = pts.map((b) => b.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const lat = (minLat + maxLat) / 2, lng = (minLng + maxLng) / 2;
    const margem = 1.6;
    const spanLng = Math.max(maxLng - minLng, 0.01) * margem;
    const spanLat = Math.max(maxLat - minLat, 0.01) * margem;
    const zLng = Math.log2((360 * LARGURA_REF) / (256 * spanLng));
    const zLat = Math.log2((360 * ALTURA_REF * Math.cos((lat * Math.PI) / 180)) / (256 * spanLat));
    const zoom = Math.max(3, Math.min(13, Math.floor(Math.min(zLng, zLat))));
    return { tipo: "geral", lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), zoom, pino: false, rotulo: state.cidade || "Todas as cidades", consulta: state.cidade ? `${state.cidade}, Brasil` : "" };
  }

  function resolverFoco() {
    const f = state.foco;
    const arred = (n) => Number(Number(n).toFixed(6));
    if (f.tipo === "bairro") {
      const b = bairroPorId(f.id);
      if (b) return { tipo: "bairro", lat: b.lat, lng: b.lng, zoom: 14, pino: true, rotulo: b.nome, consulta: `${b.nome}, ${b.cidade}, Brasil` };
    } else if (f.tipo === "ocorrencia") {
      const o = state.ocorrencias.find((x) => x.id === f.id);
      if (o) return { tipo: "ocorrencia", lat: arred(o.lat), lng: arred(o.lng), zoom: 16, pino: true, rotulo: `${TIPOS[o.tipo]} (relato comunitário)` };
    } else if (f.tipo === "rascunho" && state.rascunho) {
      return { tipo: "rascunho", lat: arred(state.rascunho.lat), lng: arred(state.rascunho.lng), zoom: 16, pino: true, rotulo: "Local informado para o relato" };
    }
    return focoGeral();
  }

  function marcarBaseAtiva() {
    $$("#base-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.base === state.base)));
  }

  function definirFoco(foco) {
    state.foco = Object.assign({ n: ++contFoco, mover: true }, foco);
  }

  function iniciarMapa() {
    if (!window.MapaProprio) { // js/mapa.js não carregou: usa só os mapas incorporados
      state.base = "google";
      const bt = $('#base-seg button[data-base="mapa"]');
      if (bt) bt.hidden = true;
      return;
    }
    mapaProp = window.MapaProprio.criar($("#mapa-proprio"), {
      aoClicar: (ponto) => { if (state.pick) definirLocalNoMapa(ponto); },
      aoErroTiles: () => toast("Não foi possível carregar as imagens do mapa de fundo. Confira a conexão: áreas e marcadores continuam visíveis.", "erro")
    });
  }

  function trocarBase(tipo) {
    if (tipo === "mapa" ? !mapaProp : !PROVEDORES[tipo]) return;
    if (state.pick && tipo !== "mapa") cancelarSelecaoNoMapa(false);
    state.base = tipo;
    marcarBaseAtiva();
    renderMapa();
  }

  // Mapa próprio: áreas coloridas por risco, marcadores de bairros e relatos, e o local marcado no relato.
  function renderMapaProprio(f) {
    const areas = [], pinos = [];
    if (state.camadas.bairros) {
      bairrosVisiveis().forEach((b) => {
        areas.push({ lat: b.lat, lng: b.lng, raioM: RAIO_BAIRRO_M[b.risco], classe: classe(b.risco) });
        pinos.push({
          lat: b.lat, lng: b.lng, classe: `pin ${classe(b.risco)}`, rotulo: `${b.nome}, risco ${b.risco}`,
          ativo: f.tipo === "bairro" && state.foco.id === b.id, aoClicar: () => selecionarBairroNoMapa(b.id, false)
        });
      });
    }
    if (state.camadas.ocorrencias) {
      ocorrenciasVisiveis().forEach((o) => {
        pinos.push({
          lat: o.lat, lng: o.lng, classe: `pin-occ ${o.gravidade}`, rotulo: `${TIPOS[o.tipo]} (relato comunitário não verificado)`,
          ativo: f.tipo === "ocorrencia" && state.foco.id === o.id, aoClicar: () => selecionarOcorrenciaNoMapa(o.id, false)
        });
      });
    }
    if (state.rascunho) pinos.push({ lat: state.rascunho.lat, lng: state.rascunho.lng, classe: "pin-draft", rotulo: "Local informado para o relato", ativo: false, aoClicar: null });
    mapaProp.setCamadas(areas, pinos);

    // Só move a vista quando o foco muda (não a cada redesenho), para não desfazer o que o usuário arrastou.
    const chave = `${state.foco.n}|${state.view}|${state.cidade}`;
    if (chave !== ultimaChave) {
      ultimaChave = chave;
      if (state.foco.mover !== false) {
        if (f.tipo === "geral") {
          const pts = bairrosVisiveis().map((b) => ({ lat: b.lat, lng: b.lng }));
          if (pts.length) mapaProp.ajustar(pts); else mapaProp.irPara(f.lat, f.lng, f.zoom);
        } else {
          mapaProp.irPara(f.lat, f.lng, f.zoom);
        }
      }
    }
  }

  function renderMapa() {
    const card = $("#map-card");
    if (!card || card.hidden) return; // cartão oculto: nada é carregado até aparecer
    const propria = state.base === "mapa" && !!mapaProp;
    const quadro = $("#mapa");
    $("#mapa-proprio").hidden = !propria;
    quadro.hidden = propria;
    $("#map-camadas").hidden = !propria;
    const f = resolverFoco();
    if (propria) {
      renderMapaProprio(f);
    } else {
      const prov = PROVEDORES[state.base];
      const url = prov.embed(f);
      if (quadro.dataset.url !== url) { quadro.src = url; quadro.dataset.url = url; } // evita recarregar sem necessidade
      quadro.title = `Mapa ${prov.rotulo} mostrando ${f.rotulo}`;
    }
    $("#link-google").href = f.consulta ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.consulta)}` : f.pino ? `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}` : `https://www.google.com/maps/@${f.lat},${f.lng},${f.zoom}z`;
    $("#link-osm").href = f.consulta ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(f.consulta)}` : f.pino ? `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=${f.zoom}/${f.lat}/${f.lng}` : `https://www.openstreetmap.org/#map=${f.zoom}/${f.lat}/${f.lng}`;
    renderChipsMapa(f);
    renderRelatosMapa(f);
    renderInfoMapa(f);
  }

  // Botão da lista sob o mapa. A lista é redesenhada a cada clique, então o foco volta ao mesmo botão.
  function adicionarChip(lista, rotulo, ativo, aoClicar, marca, rotuloAria) {
    const indice = lista.children.length;
    const li = el("li");
    const b = el("button", "chip-bairro");
    b.type = "button";
    b.setAttribute("aria-pressed", String(ativo));
    if (marca) b.append(el("span", `sw ${marca}`));
    b.append(document.createTextNode(rotulo));
    if (rotuloAria) b.setAttribute("aria-label", rotuloAria);
    b.addEventListener("click", () => {
      aoClicar();
      const alvo = lista.children[indice] && lista.children[indice].querySelector("button");
      if (alvo) alvo.focus();
    });
    li.append(b); lista.append(li);
  }

  // Riscos: um botão por bairro (mais críticos primeiro). A cor do ponto indica o nível de risco.
  function renderChipsMapa(f) {
    const lista = $("#mapa-chips");
    lista.replaceChildren();
    adicionarChip(lista, "Visão geral", f.tipo === "geral", ajustarMapa);
    const ordem = { Alto: 0, Moderado: 1, Baixo: 2 };
    bairrosVisiveis().slice().sort((x, y) => ordem[x.risco] - ordem[y.risco] || x.nome.localeCompare(y.nome, "pt-BR")).forEach((b) => {
      adicionarChip(lista, b.nome, f.tipo === "bairro" && state.foco.id === b.id, () => selecionarBairroNoMapa(b.id), classe(b.risco), `${b.nome}, risco ${b.risco}`);
    });
  }

  // O que está acontecendo: relatos comunitários recentes (losango colorido pela gravidade).
  function renderRelatosMapa(f) {
    const lista = $("#mapa-relatos");
    lista.replaceChildren();
    const recentes = ocorrenciasVisiveis().slice().sort((x, y) => new Date(y.data) - new Date(x.data)).slice(0, 12);
    $("#mapa-relatos-vazio").hidden = recentes.length > 0;
    recentes.forEach((o) => {
      const b = bairroPorId(o.bairroId);
      const quando = tempoRelativo(o.data);
      adicionarChip(lista, `${TIPOS[o.tipo]}${b ? ` em ${b.nome}` : ""}${quando ? `, ${quando}` : ""}`,
        f.tipo === "ocorrencia" && state.foco.id === o.id, () => selecionarOcorrenciaNoMapa(o.id), `diamond ${o.gravidade}`,
        `${TIPOS[o.tipo]}${b ? ` em ${b.nome}` : ""}, gravidade ${GRAVIDADES[o.gravidade].toLowerCase()}, relato não verificado`);
    });
  }

  // Texto sob o mapa: substitui os popups dos marcadores.
  function renderInfoMapa(f) {
    const info = $("#mapa-info");
    info.replaceChildren();
    const coord = (lat, lng) => el("p", "muted", `Coordenadas aproximadas: ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`);
    if (f.tipo === "bairro") {
      const b = bairroPorId(state.foco.id);
      if (state.view === "mapa") { // o painel ao lado já traz os detalhes
        const linha = el("p", "map-info-linha");
        linha.append(el("span", `badge badge-${classe(b.risco)}`, `Risco ${b.risco}`), document.createTextNode(` ${b.nome}, ${b.cidade}`));
        info.append(linha, coord(b.lat, b.lng));
      } else {
        info.append(detalhesBairro(b), coord(b.lat, b.lng));
      }
      info.append(el("p", "muted", state.base === "mapa"
        ? "A área colorida é uma região aproximada em torno do bairro, na cor do nível de risco (dado demonstrativo)."
        : "O contorno tracejado é a área do bairro, desenhada pelo Google Maps."));
    } else if (f.tipo === "ocorrencia") {
      const o = state.ocorrencias.find((x) => x.id === state.foco.id);
      info.append(detalhesOcorrencia(o), coord(o.lat, o.lng));
    } else if (f.tipo === "rascunho") {
      info.append(el("p", "", "Este é o local informado para o seu relato. Ele só será salvo ao registrar a ocorrência."), coord(f.lat, f.lng));
    } else {
      const vis = bairrosVisiveis();
      const altos = vis.filter((b) => b.risco === "Alto").length, mods = vis.filter((b) => b.risco === "Moderado").length;
      const nOcc = ocorrenciasVisiveis().length;
      info.append(el("p", "map-info-linha", `${f.rotulo}: ${altos} bairro${altos === 1 ? "" : "s"} com risco alto, ${mods} com risco moderado e ${nOcc} relato${nOcc === 1 ? "" : "s"} comunitário${nOcc === 1 ? "" : "s"} (não verificados).`),
        el("p", "muted", "Escolha um bairro ou um relato abaixo para ver o local no mapa."));
    }
  }

  function ajustarMapa() {
    definirFoco({ tipo: "geral" });
    state.bairroSelecionado = null; // o painel acompanha o que o mapa mostra
    renderMapa();
    renderPainelBairro();
  }

  function selecionarBairroNoMapa(id, mover = true) {
    state.bairroSelecionado = id;
    definirFoco({ tipo: "bairro", id, mover });
    renderMapa();
    renderPainelBairro();
  }

  // O cartão do mapa inteligente só aparece na tela "Mapa inteligente".
  function posicionarMapa() {
    const card = $("#map-card");
    if (!card) return;
    const destino = state.view === "mapa" ? $("#slot-mapa-grande") : null;
    card.classList.toggle("is-full", state.view === "mapa");
    card.hidden = !destino;
    renderMapa();
    renderPainelBairro();
  }

  function focarBairro(id) {
    const b = bairroPorId(id);
    if (!b) return;
    selecionarBairroNoMapa(b.id);
    irPara("mapa");
  }

  function selecionarOcorrenciaNoMapa(id, mover = true) {
    definirFoco({ tipo: "ocorrencia", id, mover });
    renderMapa();
  }

  function focarOcorrencia(id) {
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o) return;
    selecionarOcorrenciaNoMapa(o.id);
    irPara("mapa");
  }

  function renderPainelBairro() {
    const painel = $("#painel-bairro");
    if (!painel) return;
    painel.replaceChildren();
    const b = bairroPorId(state.bairroSelecionado);
    if (!b) {
      painel.append(el("h2", "", "Bairro selecionado"), el("p", "muted", "Escolha um bairro na lista abaixo do mapa ou use a busca para ver os detalhes do bairro."));
      return;
    }
    const cls = classe(b.risco);
    const top = el("div", "card-head");
    top.append(el("h2", "", b.nome), el("span", `badge badge-${cls}`, `Risco ${b.risco}`));
    const medidas = el("dl", "medidas");
    [["Chuva (simulada)", `${fmt(b.chuva)} mm`], ["Temperatura (simulada)", `${fmt(b.temperatura)} °C`]].forEach(([t, v]) => {
      const d = el("div"); d.append(el("dt", "", t), el("dd", "", v)); medidas.append(d);
    });
    const acoes = el("div", "card-actions");
    acoes.append(botao("Registrar relato", "btn-primary btn-sm", () => { preencherBairroRelato(b.id); irPara("ocorrencias"); }, "plus"),
                 botao("Ver alertas", "btn-secondary btn-sm", () => { state.alertaBairro = String(b.id); irPara("alertas"); renderAlertasView(); }));
    painel.append(top, el("p", "cidade", b.cidade), medidas, el("p", "orientacao", b.orientacao), el("p", "simulado", "Dado demonstrativo, não é alerta oficial."), acoes);
  }

  function iniciarControlesMapa() {
    $$("#base-seg button").forEach((b) => b.addEventListener("click", () => trocarBase(b.dataset.base)));
    marcarBaseAtiva();
    $("#camada-bairros").addEventListener("change", (e) => { state.camadas.bairros = e.target.checked; renderMapa(); });
    $("#camada-ocorrencias").addEventListener("change", (e) => { state.camadas.ocorrencias = e.target.checked; renderMapa(); });
    $("#pick-cancelar").addEventListener("click", () => cancelarSelecaoNoMapa(true));

    const campo = $("#occ-link");
    $("#occ-link-aplicar").addEventListener("click", aplicarLocalInformado);
    $("#occ-link-cancelar").addEventListener("click", () => fecharSeletorLocal());
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aplicarLocalInformado(); } }); // Enter não envia o formulário do relato
    campo.addEventListener("input", () => { campo.setAttribute("aria-invalid", "false"); $("#erro-occ-link").textContent = ""; });
  }

  /* ---------- 9. Local do relato (link do mapa ou coordenadas) ----------- */
  const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

  // Aceita links do Google Maps e do OpenStreetMap, ou coordenadas digitadas ("-23.5670, -46.6920").
  function extrairCoordenadas(entrada) {
    let t = String(entrada || "").trim();
    if (!t) return null;
    try { t = decodeURIComponent(t); } catch (e) { /* mantém o texto original */ }
    if (/^-?\d+,\d+\s+-?\d+,\d+$/.test(t)) t = t.replace(/,/g, "."); // "-23,567 -46,692"
    const padroes = [
      new RegExp(`!3d${NUM}!4d${NUM}`),                                                   // Google: ponto marcado
      new RegExp(`[?&](?:q|query|ll|center|destination)=(?:loc:)?${NUM}\\s*,\\s*${NUM}`), // Google: parâmetros
      new RegExp(`mlat=${NUM}&(?:amp;)?mlon=${NUM}`),                                     // OpenStreetMap: marcador
      new RegExp(`#map=\\d+/${NUM}/${NUM}`),                                              // OpenStreetMap: centro da visão
      new RegExp(`@${NUM},${NUM}`),                                                       // Google: centro da visão
      new RegExp(`^${NUM}\\s*[,;\\s]\\s*${NUM}$`)                                         // "lat, lng"
    ];
    for (const padrao of padroes) {
      const m = t.match(padrao);
      if (!m) continue;
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
    return null;
  }

  function abrirSeletorLocal() {
    const ref = bairroPorId($("#occ-bairro").value) || bairrosVisiveis()[0];
    if (ref) { // links para o usuário achar o ponto, já centrados no bairro escolhido
      $("#occ-abrir-google").href = `https://www.google.com/maps/search/?api=1&query=${ref.lat},${ref.lng}`;
      $("#occ-abrir-osm").href = `https://www.openstreetmap.org/?mlat=${ref.lat}&mlon=${ref.lng}#map=16/${ref.lat}/${ref.lng}`;
    }
    $("#occ-picker").hidden = false;
    $("#occ-link").focus();
  }

  function fecharSeletorLocal() {
    $("#occ-picker").hidden = true;
    $("#occ-link").value = "";
    $("#occ-link").setAttribute("aria-invalid", "false");
    $("#erro-occ-link").textContent = "";
  }

  function aplicarLocalInformado() {
    const campo = $("#occ-link"), valor = campo.value;
    const falhar = (msg) => { campo.setAttribute("aria-invalid", "true"); $("#erro-occ-link").textContent = msg; campo.focus(); };
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(valor)) {
      falhar("Links curtos não trazem as coordenadas. Abra o link, copie o endereço completo da barra do navegador e cole aqui.");
      return;
    }
    const ponto = extrairCoordenadas(valor);
    if (!ponto) {
      falhar("Não encontrei coordenadas. Cole o link completo do Google Maps ou do OpenStreetMap, ou digite no formato -23.5670, -46.6920.");
      return;
    }
    state.rascunho = ponto;
    fecharSeletorLocal();
    renderLocalRelato();
    renderMapa();
    toast("Local do relato definido.", "sucesso");
  }

  function iniciarSelecaoNoMapa() {
    if (!mapaProp) { toast("O mapa próprio não está disponível. Informe o local por link ou coordenadas.", "erro"); return; }
    state.pick = true;
    if (state.base !== "mapa") trocarBase("mapa");
    $("#pick-banner").hidden = false;
    $("#mapa-proprio").classList.add("selecionando");
    irPara("mapa");
  }

  function cancelarSelecaoNoMapa(voltar) {
    state.pick = false;
    $("#pick-banner").hidden = true;
    $("#mapa-proprio").classList.remove("selecionando");
    if (voltar) irPara("ocorrencias");
  }

  function definirLocalNoMapa(ponto) {
    state.rascunho = { lat: ponto.lat, lng: ponto.lng };
    cancelarSelecaoNoMapa(true);
    renderLocalRelato();
    renderMapa();
    toast("Local marcado no mapa.", "sucesso");
  }

  function verRascunhoNoMapa() {
    definirFoco({ tipo: "rascunho" });
    renderMapa();
    irPara("mapa");
  }

  function limparLocalRascunho() {
    state.rascunho = null;
    if (state.foco.tipo === "rascunho") definirFoco({ tipo: "geral" });
    fecharSeletorLocal();
    renderLocalRelato();
    renderMapa();
  }

  function renderLocalRelato() {
    const box = $("#occ-local");
    box.replaceChildren();
    box.append(icone("pin"));
    if (state.rascunho) {
      box.append(el("span", "", `Local informado: ${state.rascunho.lat.toFixed(4)}, ${state.rascunho.lng.toFixed(4)}`));
      box.append(botao("Ver no mapa", "btn-secondary btn-sm", verRascunhoNoMapa, "map"));
      box.append(botao("Marcar de novo no mapa", "btn-secondary btn-sm", iniciarSelecaoNoMapa));
      box.append(botao("Link ou coordenadas", "btn-secondary btn-sm", abrirSeletorLocal));
      box.append(botao("Remover", "btn-secondary btn-sm", limparLocalRascunho));
    } else {
      box.append(el("span", "", "Sem local informado: será usada a localização aproximada do bairro."));
      box.append(botao("Marcar no mapa", "btn-secondary btn-sm", iniciarSelecaoNoMapa, "map"));
      box.append(botao("Link ou coordenadas", "btn-secondary btn-sm", abrirSeletorLocal));
    }
  }

  /* ---------- 10. Onde estou, rotas de fuga e monitoramento -------------- */
  /* ---- 10.1 Cálculos: distância, direção e destinos ---- */
  const RUMOS = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];

  // Direção (rosa dos ventos) para ir do ponto a até o ponto b, em linha reta.
  function rumo(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    const graus = (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
    return RUMOS[Math.round(graus / 45) % 8];
  }

  function formatarDist(km) {
    return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${fmt(km)} km`;
  }

  // Bairro monitorado mais próximo da posição do usuário e se ele está "dentro" (até DISTANCIA_MAX_KM).
  function situacaoAtual() {
    if (!state.local || !state.bairros.length) return null;
    let melhor = null;
    state.bairros.forEach((b) => {
      const km = distanciaKm(state.local, b);
      if (!melhor || km < melhor.km) melhor = { bairro: b, km };
    });
    return { bairro: melhor.bairro, km: melhor.km, dentro: melhor.km <= DISTANCIA_MAX_KM };
  }

  // Destinos seguros: primeiro bairros sem risco (nível baixo), depois locais cobertos. Cada lista ordenada pela distância.
  function calcularDestinos() {
    const sit = situacaoAtual();
    if (!sit) return null;
    const origem = state.local;
    const bairros = state.bairros
      .filter((b) => b.risco === "Baixo" && !(sit.dentro && b.id === sit.bairro.id))
      .map((b) => ({ chave: `bairro-${b.id}`, tipo: "bairro", nome: b.nome, cidade: b.cidade, lat: b.lat, lng: b.lng, km: distanciaKm(origem, b) }))
      .filter((d) => d.km <= DESTINO_MAX_KM).sort((x, y) => x.km - y.km).slice(0, 3);
    const cobertos = LOCAIS_COBERTOS
      .map((c) => ({ chave: `coberto-${c.id}`, tipo: "coberto", nome: c.nome, cidade: c.cidade, lat: c.lat, lng: c.lng, km: distanciaKm(origem, c), dado: c }))
      .filter((d) => d.km <= DESTINO_MAX_KM).sort((x, y) => x.km - y.km).slice(0, 3);
    return { sit, bairros, cobertos, lista: bairros.concat(cobertos) };
  }

  /* ---- 10.2 Definir a posição do usuário ---- */
  function definirLocal(ponto, origem, extra) {
    state.local = Object.assign({ lat: ponto.lat, lng: ponto.lng, origem, precisao: null, bairroId: null, quando: new Date().toISOString() }, extra);
    state.fuga.destino = "";
    salvarJSON(STORAGE.local, state.local);
    renderLocais(true);
  }

  function usarGPS(status) {
    if (!("geolocation" in navigator)) {
      status.textContent = "Este navegador não oferece localização. Escolha o bairro na lista.";
      return;
    }
    const sucesso = (pos) => {
      definirLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps", { precisao: Math.round(pos.coords.accuracy) });
      status.textContent = "Localização encontrada.";
    };
    const msgs = {
      1: "A permissão de localização foi negada. Escolha onde você está na lista ou toque no mapa.",
      2: "Não foi possível obter sua posição agora. Escolha onde você está na lista ou toque no mapa.",
      3: "A localização não respondeu a tempo. Escolha onde você está na lista ou toque no mapa."
    };
    status.textContent = "Buscando sua localização…";
    // 1ª tentativa: posição aproximada (rede/Wi-Fi), rápida e funciona em computador sem GPS.
    navigator.geolocation.getCurrentPosition(sucesso, (erro) => {
      if (erro.code === 1) { status.textContent = msgs[1]; return; }
      // 2ª tentativa: alta precisão (GPS do aparelho), com mais tempo.
      status.textContent = "Tentando com mais precisão, isso pode levar alguns segundos…";
      navigator.geolocation.getCurrentPosition(sucesso, (erro2) => {
        status.textContent = msgs[erro2.code] || msgs[2];
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  // Controles de localização (GPS + lista de bairros), usados na tela "Onde estou" e na tela de fuga.
  function montarSeletorLocal(destino, sufixo) {
    destino.replaceChildren();
    const status = el("p", "local-status");
    status.setAttribute("role", "status");
    const campo = el("div", "field");
    const rotulo = el("label", "", "Ou escolha onde você está");
    rotulo.htmlFor = `sel-local-${sufixo}`;
    const select = el("select");
    select.id = `sel-local-${sufixo}`;
    const vazio = el("option", "", "Selecione o bairro"); vazio.value = ""; select.append(vazio);
    state.bairros.slice().sort((x, y) => x.cidade.localeCompare(y.cidade, "pt-BR") || x.nome.localeCompare(y.nome, "pt-BR")).forEach((b) => {
      const o = el("option", "", `${b.nome} (${b.cidade})`); o.value = String(b.id); select.append(o);
    });
    select.addEventListener("change", () => {
      const b = bairroPorId(select.value);
      if (!b) return;
      definirLocal({ lat: b.lat, lng: b.lng }, "bairro", { bairroId: b.id });
      status.textContent = `Local definido: ${b.nome}, ${b.cidade}.`;
    });
    campo.append(rotulo, select);
    const gps = botao("Usar minha localização", "btn-primary", () => usarGPS(status), "locate");
    const caixa = el("div", "local-controles");
    caixa.append(gps, campo);
    destino.append(caixa, status);
    seletoresLocal.push(select);
  }

  function iniciarLocais() {
    montarSeletorLocal($("#slot-local-estou"), "estou");
    montarSeletorLocal($("#slot-local-fuga"), "fuga");
    if (!window.MapaProprio) { // sem o mapa próprio, as telas continuam funcionando só com texto
      $$(".map-local, .map-fuga").forEach((c) => { c.hidden = true; });
      return;
    }
    let avisouTiles = false; // um único aviso para os dois mapas
    const aoErro = () => {
      if (avisouTiles) return;
      avisouTiles = true;
      toast("Não foi possível carregar as imagens do mapa de fundo. Confira a conexão: áreas, marcadores e a rota continuam visíveis.", "erro");
    };
    mapaLocal = window.MapaProprio.criar($("#mapa-local"), {
      aoClicar: (ponto) => { definirLocal(ponto, "mapa"); toast("Posição ajustada no mapa.", "sucesso"); },
      aoErroTiles: aoErro
    });
    mapaFuga = window.MapaProprio.criar($("#mapa-fuga"), { aoErroTiles: aoErro });
  }

  /* ---- 10.3 Tela "Onde estou" ---- */
  const TEXTO_RISCO = {
    Alto: "Risco alto neste local. Se estiver em encosta ou área que alaga, saia agora e siga a Defesa Civil.",
    Moderado: "Risco moderado. Fique atento e já saiba para onde ir se a situação piorar.",
    Baixo: "Risco baixo. Não há necessidade de sair, mas continue acompanhando."
  };

  function linkBotao(texto, href, cls, iconeNome) {
    const a = el("a", `btn ${cls}`);
    a.href = href;
    if (iconeNome) a.append(icone(iconeNome));
    a.append(document.createTextNode(texto));
    return a;
  }

  function renderSituacao() {
    const corpo = $("#situacao-corpo"), card = $("#card-situacao");
    corpo.replaceChildren();
    card.className = "card situacao";
    const sit = situacaoAtual();
    if (!sit) {
      corpo.append(el("p", "eyebrow", "Sua localização"), el("p", "situacao-titulo", "Onde você está?"),
        el("p", "", "Use o GPS, escolha o bairro na lista ou toque no mapa. Com isso você vê o risco do local e a rota de saída."));
      return;
    }
    const l = state.local;
    const origem = `${LOCAL_ORIGEM[l.origem]}${l.origem === "gps" && l.precisao ? `, precisão de cerca de ${l.precisao} m` : ""}.`;
    if (!sit.dentro) {
      const cidades = new Set(state.bairros.map((b) => b.cidade)).size;
      corpo.append(el("p", "eyebrow", "Fora das áreas monitoradas"), el("p", "situacao-titulo", "Nenhum bairro monitorado por perto"),
        el("p", "", `O mais próximo é ${sit.bairro.nome} (${sit.bairro.cidade}), a ${formatarDist(sit.km)}. A demonstração cobre ${state.bairros.length} bairros em ${cidades} cidades: escolha um deles na lista para testar.`),
        el("p", "muted", origem), linkBotao("Ver rota de fuga", "#fuga", "btn-secondary", "exit"));
      return;
    }
    const b = sit.bairro, nivel = RISCO_PARA_NIVEL[b.risco];
    card.className = `card situacao alert-now nivel-${nivel}`;
    const topo = el("div", "situacao-topo");
    topo.append(el("p", "eyebrow", "Você está em"), el("span", `badge badge-${classe(b.risco)}`, `Risco ${b.risco}`));
    const medidas = el("dl", "medidas");
    [["Chuva (simulada)", `${fmt(b.chuva)} mm`], ["Temperatura (simulada)", `${fmt(b.temperatura)} °C`]].forEach(([t, v]) => {
      const d = el("div"); d.append(el("dt", "", t), el("dd", "", v)); medidas.append(d);
    });
    corpo.append(topo, el("p", "situacao-titulo", `${b.nome}, ${b.cidade}`), el("p", "situacao-risco", TEXTO_RISCO[b.risco]),
      el("p", "orientacao", b.orientacao), medidas);
    if (b.risco === "Alto") corpo.append(linkBotao("Sair desta área", "#fuga", "btn-danger btn-lg", "exit"));
    else if (b.risco === "Moderado") corpo.append(linkBotao("Ver rota de fuga", "#fuga", "btn-secondary", "exit"));
    corpo.append(el("p", "simulado", `${origem} Dado demonstrativo, não é alerta oficial.`));
  }

  function renderMapaLocal(mover) {
    if (!mapaLocal) return;
    const areas = [], pinos = [];
    state.bairros.forEach((b) => {
      areas.push({ lat: b.lat, lng: b.lng, raioM: RAIO_BAIRRO_M[b.risco], classe: classe(b.risco) });
      pinos.push({ lat: b.lat, lng: b.lng, classe: `pin ${classe(b.risco)}`, rotulo: `${b.nome}, risco ${b.risco}`, ativo: false, aoClicar: null });
    });
    LOCAIS_COBERTOS.forEach((c) => pinos.push({ lat: c.lat, lng: c.lng, classe: "pin-coberto", rotulo: `${c.nome}, local coberto fictício`, ativo: false, aoClicar: null }));
    if (state.local) pinos.push({ lat: state.local.lat, lng: state.local.lng, classe: "pin-voce", rotulo: "Você está aqui", ativo: false, aoClicar: null });
    mapaLocal.setCamadas(areas, pinos);
    if (!mover) return;
    const sit = situacaoAtual();
    if (!sit) mapaLocal.ajustar(state.bairros.map((b) => ({ lat: b.lat, lng: b.lng })));
    else if (sit.dentro) mapaLocal.irPara(state.local.lat, state.local.lng, 14);
    else mapaLocal.ajustar([state.local, sit.bairro], { zoomMax: 12 });
  }

  /* ---- 10.4 Tela de fuga ---- */
  function renderFuga(mover) {
    const semLocal = !state.local;
    ["#fuga-destino", "#fuga-mapa-card", "#fuga-alternativas-card"].forEach((id) => { $(id).hidden = semLocal; });
    $("#fuga-sem-local").hidden = !semLocal;
    const resumo = $("#fuga-resumo");
    if (semLocal) {
      resumo.textContent = "Informe onde você está para ver o destino mais seguro. Os telefones de emergência já estão abaixo.";
      if (mapaFuga) mapaFuga.setRota(null);
      return;
    }
    const dados = calcularDestinos();
    const { sit, lista } = dados;
    const quem = sit.dentro ? `Você está em ${sit.bairro.nome} (risco ${sit.bairro.risco.toLowerCase()}).` : "Você está fora das áreas monitoradas.";
    const escolhido = lista.find((d) => d.chave === state.fuga.destino) || lista[0] || null;
    const card = $("#fuga-destino");
    card.replaceChildren();

    if (!escolhido) {
      resumo.textContent = quem;
      const semDestino = el("h3", "", "Nenhum destino a menos de 40 km");
      semDestino.id = "t-fuga-destino";
      card.append(el("p", "eyebrow", "Sem destino cadastrado"), semDestino,
        el("p", "", "A demonstração não tem bairro sem risco nem local coberto perto de você. Ligue para a Defesa Civil (199) e siga as orientações."));
      $("#fuga-alternativas-card").hidden = true;
      renderMapaFuga(null, [], mover);
      return;
    }

    const recomendado = escolhido === lista[0];
    const direcao = rumo(state.local, escolhido);
    resumo.textContent = `${quem} Destino ${recomendado ? "recomendado" : "escolhido"}: ${escolhido.nome}, a ${formatarDist(escolhido.km)} em direção ao ${direcao}.`;

    const selos = el("div", "occ-meta");
    if (escolhido.tipo === "bairro") selos.append(el("span", "badge badge-baixo", "Bairro sem risco"));
    else selos.append(el("span", "badge badge-neutro", `Local coberto: ${escolhido.dado.tipo}`), el("span", "tag", "Sugestão fictícia"));
    const titulo = el("h3", "", escolhido.nome);
    titulo.id = "t-fuga-destino";
    titulo.tabIndex = -1;
    const medidas = el("dl", "medidas");
    [["Distância em linha reta", formatarDist(escolhido.km)], ["Direção", direcao.charAt(0).toUpperCase() + direcao.slice(1)]].forEach(([t, v]) => {
      const d = el("div"); d.append(el("dt", "", t), el("dd", "", v)); medidas.append(d);
    });
    card.append(el("p", "eyebrow", recomendado ? "Destino recomendado" : "Destino escolhido"), titulo, selos,
      el("p", "destino-instrucao", `Siga em direção ao ${direcao} por cerca de ${formatarDist(escolhido.km)}.`), medidas);
    if (escolhido.tipo === "coberto") {
      card.append(el("p", "muted", `${escolhido.cidade}. Endereço fictício: ${escolhido.dado.endereco}. Capacidade fictícia: ${escolhido.dado.capacidade} pessoas.`));
    } else {
      card.append(el("p", "muted", `${escolhido.cidade}. Risco atual simulado: baixo.`));
    }
    if (dados.bairros.length === 0) {
      card.append(el("p", "destino-aviso", "Não há bairro sem risco por perto. O destino principal é o local coberto mais próximo."));
    }

    const alt = $("#fuga-alternativas");
    alt.replaceChildren();
    lista.filter((d) => d !== escolhido).forEach((d) => {
      const li = el("li");
      const b = el("button", `row-item nivel-${d.tipo === "bairro" ? "baixo" : "informativo"}`);
      b.type = "button";
      const principal = el("div", "row-main");
      const t = el("div", "row-title"); t.append(el("span", "", d.nome), d.tipo === "bairro" ? el("span", "badge badge-baixo", "Bairro sem risco") : el("span", "badge badge-neutro", "Local coberto"));
      if (d === lista[0]) t.append(el("span", "tag", "Recomendado"));
      principal.append(t, el("p", "row-sub", `${formatarDist(d.km)} em direção ao ${rumo(state.local, d)}${d.tipo === "coberto" ? ", sugestão fictícia" : ""}`));
      b.append(principal);
      b.setAttribute("aria-label", `Ir para ${d.nome}, ${d.tipo === "bairro" ? "bairro sem risco" : "local coberto fictício"}, a ${formatarDist(d.km)} em direção ao ${rumo(state.local, d)}`);
      b.addEventListener("click", () => selecionarDestino(d.chave));
      li.append(b); alt.append(li);
    });
    $("#fuga-alternativas-card").hidden = lista.length <= 1;
    renderMapaFuga(escolhido, lista, mover);
  }

  function selecionarDestino(chave) {
    state.fuga.destino = chave;
    renderFuga(true);
    const t = $("#t-fuga-destino");
    if (t) t.focus({ preventScroll: false });
  }

  function renderMapaFuga(escolhido, lista, mover) {
    if (!mapaFuga) return;
    const areas = state.bairros.map((b) => ({ lat: b.lat, lng: b.lng, raioM: RAIO_BAIRRO_M[b.risco], classe: classe(b.risco) }));
    const pinos = [];
    lista.forEach((d) => {
      if (d === escolhido) return;
      pinos.push({ lat: d.lat, lng: d.lng, classe: d.tipo === "bairro" ? `pin ${classe("Baixo")}` : "pin-coberto", rotulo: `Escolher ${d.nome} como destino`, ativo: false, aoClicar: () => selecionarDestino(d.chave) });
    });
    if (escolhido) pinos.push({ lat: escolhido.lat, lng: escolhido.lng, classe: "pin-destino", rotulo: `Destino: ${escolhido.nome}`, ativo: false, aoClicar: null });
    pinos.push({ lat: state.local.lat, lng: state.local.lng, classe: "pin-voce", rotulo: "Você está aqui", ativo: false, aoClicar: null });
    mapaFuga.setCamadas(areas, pinos);
    mapaFuga.setRota(escolhido ? { de: state.local, para: escolhido } : null);
    if (mover) {
      if (escolhido) mapaFuga.ajustar([state.local, escolhido], { margem: 64, zoomMax: 15 });
      else mapaFuga.irPara(state.local.lat, state.local.lng, 13);
    }
  }

  // Atualiza as duas telas quando a posição ou o risco mudam.
  function renderLocais(mover) {
    renderSituacao();
    seletoresLocal.forEach((s) => { s.value = state.local && state.local.origem === "bairro" && state.local.bairroId ? String(state.local.bairroId) : ""; });
    if (!state.local) $("#det-local").open = true;
    renderMapaLocal(!!mover && state.view === "onde-estou");
    renderFuga(!!mover && state.view === "fuga");
  }

  function renderOrientacoes(destino) {
    destino.replaceChildren();
    const dicas = [
      ["droplet", "Evite áreas alagadas", "Água de enchente pode esconder buracos, fios e correntezas fortes."],
      ["shield", "Tenha um plano em família", "Combine um ponto de encontro seguro e guarde documentos em saco impermeável."],
      ["alert", "Fique atento a sinais em encostas", "Rachaduras, barulho de terra e água barrenta pedem atenção. Em caso de risco, ligue 199."]
    ];
    dicas.forEach(([ic, t, d]) => {
      const tip = el("div", "tip");
      const fi = el("div", "feature-icon"); fi.append(icone(ic));
      const txt = el("p"); txt.append(el("strong", "", t), document.createTextNode(d));
      tip.append(fi, txt); destino.append(tip);
    });
  }

  function cardBairro(b) {
    const cls = classe(b.risco);
    const card = el("article", `card-bairro risco-${cls}`);
    card.setAttribute("aria-label", `${b.nome}, ${b.cidade}: risco ${b.risco} (dado simulado)`);
    const topo = el("div", "card-top");
    topo.append(el("h3", "", b.nome), el("span", `badge badge-${cls}`, `Risco ${b.risco}`));
    const medidas = el("dl", "medidas");
    [["Chuva (simulada)", `${fmt(b.chuva)} mm`], ["Temperatura (simulada)", `${fmt(b.temperatura)} °C`]].forEach(([t, v]) => {
      const d = el("div"); d.append(el("dt", "", t), el("dd", "", v)); medidas.append(d);
    });
    const barra = el("div", "barra"); barra.setAttribute("aria-hidden", "true");
    const pre = el("span"); pre.style.width = `${Math.min(100, (b.chuva / 120) * 100)}%`; barra.append(pre);
    const acoes = el("div", "card-actions");
    acoes.append(botao("Ver no mapa", "btn-secondary btn-sm", () => focarBairro(b.id), "map"),
                 botao("Registrar relato", "btn-secondary btn-sm", () => { preencherBairroRelato(b.id); irPara("ocorrencias"); }, "plus"));
    card.append(topo, el("p", "cidade", b.cidade), medidas, barra, el("p", "orientacao", b.orientacao), el("p", "simulado", "Dado demonstrativo, não é alerta oficial."), acoes);
    return card;
  }

  function renderMonitoramento() {
    const busca = normalizarTexto(state.filtroMon.busca);
    const lista = bairrosVisiveis().filter((b) => (!busca || normalizarTexto(b.nome).includes(busca)) && (!state.filtroMon.risco || b.risco === state.filtroMon.risco));
    $("#cards-bairros").replaceChildren(...lista.map(cardBairro));
    $("#estado-vazio-mon").hidden = lista.length > 0;
    $("#contagem-mon").textContent = lista.length === 1 ? "Exibindo 1 bairro." : `Exibindo ${lista.length} de ${bairrosVisiveis().length} bairros.`;
  }

  function iniciarMonitoramento() {
    $("#mon-busca").addEventListener("input", (e) => { state.filtroMon.busca = e.target.value; renderMonitoramento(); });
    $("#mon-risco").addEventListener("change", (e) => { state.filtroMon.risco = e.target.value; renderMonitoramento(); });
    $("#mon-limpar").addEventListener("click", () => {
      state.filtroMon = { busca: "", risco: "" };
      $("#mon-busca").value = ""; $("#mon-risco").value = "";
      renderMonitoramento(); $("#mon-busca").focus();
    });
  }

  /* ---------- 11. Ocorrências -------------------------------------------- */
  function classeGravidade(g) { return g === "alta" ? "alto" : g === "media" ? "moderado" : "baixo"; }

  function itemOcorrenciaResumo(o) {
    const b = bairroPorId(o.bairroId);
    const li = el("li");
    const item = el("button", `row-item nivel-${classeGravidade(o.gravidade)}`); item.type = "button";
    const main = el("div", "row-main");
    const t = el("div", "row-title"); t.append(el("span", "", TIPOS[o.tipo]), el("span", `badge badge-${classeGravidade(o.gravidade)}`, GRAVIDADES[o.gravidade]));
    main.append(t, el("p", "row-sub", `${b ? b.nome : ""}, relato comunitário não verificado`));
    item.append(main, el("span", "row-end", tempoRelativo(o.data)));
    item.addEventListener("click", () => focarOcorrencia(o.id));
    li.append(item);
    return li;
  }

  function cardOcorrencia(o) {
    const b = bairroPorId(o.bairroId);
    const li = el("li");
    const card = el("article", `row-item nivel-${classeGravidade(o.gravidade)}`);
    const ic = el("div", "feature-icon"); ic.append(icone(ICONES_TIPO[o.tipo] || "info"));
    const main = el("div", "row-main");
    const t = el("div", "row-title"); t.append(el("span", "", `${TIPOS[o.tipo]} em ${b ? b.nome : "bairro"}`));
    const meta = el("div", "occ-meta");
    meta.append(el("span", `badge badge-${classeGravidade(o.gravidade)}`, `Gravidade ${GRAVIDADES[o.gravidade].toLowerCase()}`),
                el("span", "badge badge-neutro", STATUS[o.status]),
                el("span", "muted", formatarDataHora(o.data)));
    if (o.origem === "demonstrativo") meta.append(el("span", "badge badge-neutro", "Relato demonstrativo"));
    const acoes = el("div", "occ-actions");
    acoes.append(botao("Ver no mapa", "btn-secondary btn-sm", () => focarOcorrencia(o.id), "map"));
    if (o.status !== "resolvida") {
      acoes.append(botao("Marcar como resolvida", "btn-secondary btn-sm", () => alterarStatus(o.id, "resolvida"), "check"));
      if (o.status === "aguardando") acoes.append(botao("Em acompanhamento", "btn-secondary btn-sm", () => alterarStatus(o.id, "acompanhamento")));
    } else {
      acoes.append(botao("Reabrir", "btn-secondary btn-sm", () => alterarStatus(o.id, "aguardando")));
    }
    if (o.origem === "usuario") acoes.append(botao("Remover", "btn-secondary btn-sm", () => removerOcorrencia(o.id)));
    main.append(t, meta, el("p", "row-sub", o.descricao), el("p", "occ-note", "Relato comunitário não verificado. Não é confirmação oficial."), acoes);
    card.append(ic, main);
    li.append(card);
    return li;
  }

  function alterarStatus(id, status) {
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o) return;
    o.status = status;
    salvarOcorrencias();
    renderOcorrencias(); renderComunidade();
    toast(`Status atualizado: ${STATUS[status]}.`, "sucesso");
  }

  function removerOcorrencia(id) {
    state.ocorrencias = state.ocorrencias.filter((o) => o.id !== id);
    salvarOcorrencias();
    renderOcorrencias(); renderMapa(); renderComunidade(); atualizarContadores();
    toast("Relato removido.", "sucesso");
  }

  function preencherBairroRelato(id) {
    $("#occ-bairro").value = String(id);
  }

  function renderOcorrencias() {
    const visiveis = ocorrenciasVisiveis();
    const lista = visiveis.filter((o) => (!state.filtroOcc.bairro || String(o.bairroId) === state.filtroOcc.bairro) && (!state.filtroOcc.tipo || o.tipo === state.filtroOcc.tipo))
      .slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    $("#lista-ocorrencias").replaceChildren(...lista.map(cardOcorrencia));
    $("#estado-vazio-occ").hidden = lista.length > 0;
    $("#contagem-occ").textContent = lista.length === 1 ? "1 relato exibido." : `${lista.length} relatos exibidos.`;
    renderLocalRelato();
  }

  function popularSelectBairros(select, comTodos, rotuloTodos) {
    const atual = select.value;
    select.replaceChildren();
    if (comTodos) { const o = el("option", "", rotuloTodos); o.value = ""; select.append(o); }
    else { const o = el("option", "", "Selecione o bairro"); o.value = ""; select.append(o); }
    bairrosVisiveis().forEach((b) => { const o = el("option", "", `${b.nome} (${b.cidade})`); o.value = String(b.id); select.append(o); });
    if (Array.from(select.options).some((o) => o.value === atual)) select.value = atual;
  }

  function dataHoraLocalAgora() {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function iniciarOcorrencias() {
    const form = $("#form-ocorrencia");
    const campos = { tipo: $("#occ-tipo"), gravidade: $("#occ-gravidade"), bairro: $("#occ-bairro"), data: $("#occ-data"), descricao: $("#occ-descricao") };
    Object.entries(TIPOS).forEach(([v, t]) => { const o = el("option", "", t); o.value = v; campos.tipo.append(o); $("#occ-filtro-tipo").append(o.cloneNode(true)); });
    Object.entries(GRAVIDADES).forEach(([v, t]) => { const o = el("option", "", t); o.value = v; campos.gravidade.append(o); });
    campos.data.value = dataHoraLocalAgora();

    const erro = (nome, msg) => {
      campos[nome].setAttribute("aria-invalid", msg ? "true" : "false");
      $(`#erro-occ-${nome}`).textContent = msg;
    };

    function validar() {
      const e = {};
      if (!campos.tipo.value) e.tipo = "Escolha o tipo de ocorrência.";
      if (!campos.gravidade.value) e.gravidade = "Escolha o nível de gravidade.";
      if (!campos.bairro.value) e.bairro = "Selecione o bairro.";
      const desc = campos.descricao.value.trim();
      if (desc.length < 10) e.descricao = "Descreva o que você viu em pelo menos 10 caracteres.";
      else if (desc.length > 280) e.descricao = "A descrição pode ter no máximo 280 caracteres.";
      const quando = new Date(campos.data.value);
      if (!campos.data.value || isNaN(quando)) e.data = "Informe a data e o horário.";
      else if (quando.getTime() > Date.now() + 60000) e.data = "A data e o horário não podem estar no futuro.";
      const b = bairroPorId(campos.bairro.value);
      if (b && state.rascunho && distanciaKm(state.rascunho, b) > DISTANCIA_MAX_KM) {
        e.bairro = `O local informado fica a mais de ${DISTANCIA_MAX_KM} km de ${b.nome}. Escolha outro bairro ou informe outro local.`;
      }
      Object.keys(campos).forEach((n) => erro(n, e[n] || ""));
      return e;
    }

    Object.keys(campos).forEach((n) => {
      campos[n].addEventListener(n === "descricao" || n === "data" ? "input" : "change", () => {
        if (campos[n].getAttribute("aria-invalid") === "true") erro(n, "");
        if (n === "descricao") $("#occ-contador").textContent = `${campos.descricao.value.length}/280`;
      });
    });

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const e = validar();
      const fb = $("#feedback-occ");
      const primeiro = Object.keys(campos).find((n) => e[n]);
      if (primeiro) {
        fb.className = "feedback feedback-erro"; fb.replaceChildren(el("p", "", "Revise os campos destacados antes de registrar.")); fb.hidden = false;
        campos[primeiro].focus();
        return;
      }
      const b = bairroPorId(campos.bairro.value);
      const ponto = state.rascunho || { lat: b.lat, lng: b.lng };
      state.ocorrencias.push({
        id: uid("occ"), tipo: campos.tipo.value, descricao: campos.descricao.value.trim(), bairroId: b.id,
        lat: ponto.lat, lng: ponto.lng, data: new Date(campos.data.value).toISOString(),
        gravidade: campos.gravidade.value, status: "aguardando", origem: "usuario"
      });
      const salvou = salvarJSON(STORAGE.ocorrencias, state.ocorrencias);
      const bairroNome = b.nome;
      form.reset(); campos.data.value = dataHoraLocalAgora(); $("#occ-contador").textContent = "0/280";
      limparLocalRascunho();
      fb.className = "feedback feedback-sucesso";
      fb.replaceChildren(el("p", "", salvou ? `Relato registrado em ${bairroNome} como relato comunitário não verificado.` : `Relato registrado em ${bairroNome}, mas este navegador não permitiu guardá-lo localmente.`));
      fb.hidden = false;
      toast("Relato registrado no mapa.", "sucesso");
      renderTudo();
    });

    $("#occ-filtro-bairro").addEventListener("change", (e) => { state.filtroOcc.bairro = e.target.value; renderOcorrencias(); });
    $("#occ-filtro-tipo").addEventListener("change", (e) => { state.filtroOcc.tipo = e.target.value; renderOcorrencias(); });
    $("#occ-limpar").addEventListener("click", () => {
      state.filtroOcc = { bairro: "", tipo: "" };
      $("#occ-filtro-bairro").value = ""; $("#occ-filtro-tipo").value = "";
      renderOcorrencias();
    });
  }

  /* ---------- 12. Alertas ------------------------------------------------ */
  function itemAlerta(a, compacto) {
    const li = el("li");
    const item = el("div", `row-item nivel-${a.nivel}${a.lido ? "" : " nao-lido"}`);
    const main = el("div", "row-main");
    const t = el("div", "row-title"); t.append(el("span", "", a.titulo), el("span", `badge badge-${a.nivel}`, NIVEIS_ALERTA[a.nivel]));
    main.append(t);
    if (!compacto) main.append(el("p", "row-sub", a.mensagem));
    main.append(el("p", "row-sub", `Alerta simulado, ${tempoRelativo(a.data)}`));
    item.append(main);
    li.append(item);
    return li;
  }

  function atualizarContadores() {
    const naoLidos = alertasRelevantes().filter((a) => !a.lido).length;
    const dot = $("#notif-dot"); dot.textContent = String(naoLidos); dot.hidden = naoLidos === 0;
    $("#btn-notificacoes").setAttribute("aria-label", naoLidos ? `Notificações, ${naoLidos} não lidas` : "Notificações, nenhuma nova");
    const nav = $("#nav-count-alertas"); nav.textContent = String(naoLidos); nav.hidden = naoLidos === 0;
    const navOcc = $("#nav-count-ocorrencias");
    const abertas = state.ocorrencias.filter((o) => o.origem === "usuario" && o.status !== "resolvida").length;
    navOcc.textContent = String(abertas); navOcc.hidden = abertas === 0;
  }

  function renderPainelNotificacoes() {
    const corpo = $("#notif-lista"); corpo.replaceChildren();
    const itens = alertasRelevantes().slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
    if (!itens.length) corpo.append(el("li", "empty", "Nenhum alerta por enquanto."));
    itens.forEach((a) => corpo.append(itemAlerta(a, true)));
  }

  function renderAlertasUI() {
    atualizarContadores(); renderPainelNotificacoes(); renderAlertasView();
  }

  function renderAlertasView() {
    const sel = $("#alerta-bairro");
    sel.value = state.alertaBairro;
    if (sel.value !== state.alertaBairro) state.alertaBairro = sel.value; // bairro fora da localização atual
    const valor = state.alertaBairro;
    const b = bairroPorId(valor);
    const atual = $("#alerta-atual"); atual.replaceChildren();
    if (b) {
      const nivel = RISCO_PARA_NIVEL[b.risco];
      atual.className = `card alert-now nivel-${nivel}`;
      const cab = el("div", "card-head");
      cab.append(el("h2", "", `${b.nome}, ${b.cidade}`), el("span", `badge badge-${nivel}`, NIVEIS_ALERTA[nivel]));
      atual.append(cab,
        el("p", "", `Chuva simulada: ${fmt(b.chuva)} mm. Temperatura simulada: ${fmt(b.temperatura)} °C. Nível de risco: ${b.risco}.`),
        el("p", "", b.orientacao),
        el("p", "simulado", "Alerta simulado para demonstração. Não é alerta oficial."));
    } else {
      atual.className = "card";
      atual.append(el("h2", "", "Escolha um bairro"), el("p", "muted", "Selecione um bairro para ver o alerta atual, o nível de risco e as orientações preventivas."));
    }
    const lista = $("#alerta-historico"); lista.replaceChildren();
    const historico = state.alertas.filter((a) => (!valor || String(a.bairroId) === valor) && (!state.cidade || (bairroPorId(a.bairroId) || {}).cidade === state.cidade))
      .slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    $("#estado-vazio-alt").hidden = historico.length > 0;
    historico.forEach((a) => lista.append(itemAlerta(a, false)));
  }

  function simularAtualizacao() {
    const alvo = bairroPorId(state.alertaBairro) || bairrosVisiveis()[0];
    if (!alvo) return;
    const anterior = alvo.risco;
    const variacao = Math.round((Math.random() * 60 - 25) * 10) / 10;
    alvo.chuva = Math.max(0, Math.min(140, Math.round((alvo.chuva + variacao) * 10) / 10));
    atualizarRisco(alvo);
    state.alertas.push(criarAlerta(alvo, anterior, false));
    salvarChuva(); salvarAlertas();
    renderTudo();
    toast(`Atualização simulada em ${alvo.nome}: ${fmt(alvo.chuva)} mm (risco ${alvo.risco}).`, "sucesso");
  }

  function iniciarAlertas() {
    const sel = $("#alerta-bairro");
    sel.addEventListener("change", () => { state.alertaBairro = sel.value; renderAlertasView(); });
    $("#alerta-simular").addEventListener("click", simularAtualizacao);
    $("#alerta-ler").addEventListener("click", marcarTodasLidas);
    iniciarFormInscricao();
  }

  // Cadastro de inscrição demonstrativa (recurso já existente, mantido).
  function iniciarFormInscricao() {
    const form = $("#form-alerta");
    const campos = { nome: $("#nome"), email: $("#email"), cep: $("#cep"), bairro: $("#bairro") };
    const fb = $("#feedback-form");
    const erro = (n, msg) => { campos[n].setAttribute("aria-invalid", msg ? "true" : "false"); $(`#erro-${n}`).textContent = msg; };
    const validar = () => {
      const e = {
        nome: window.AB.validarNome(campos.nome.value), email: window.AB.validarEmail(campos.email.value),
        cep: window.AB.validarCep(campos.cep.value), bairro: window.AB.validarBairroCep(campos.bairro.value, campos.cep.value, state.bairros)
      };
      Object.entries(e).forEach(([n, m]) => erro(n, m));
      return e;
    };
    campos.cep.addEventListener("input", () => { campos.cep.value = window.AB.formatarCep(campos.cep.value); });
    Object.keys(campos).forEach((n) => campos[n].addEventListener(n === "bairro" ? "change" : "input", () => { if (campos[n].getAttribute("aria-invalid") === "true") erro(n, ""); }));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const e = validar();
      const primeiro = Object.keys(e).find((n) => e[n]);
      if (primeiro) {
        fb.className = "feedback feedback-erro"; fb.replaceChildren(el("p", "", "Revise os campos destacados antes de enviar.")); fb.hidden = false;
        campos[primeiro].focus(); return;
      }
      const b = bairroPorId(campos.bairro.value);
      const salvou = window.AB.salvarInscricao({ nome: campos.nome.value.trim(), email: campos.email.value.trim(), cep: campos.cep.value, bairro: b.nome, cidade: b.cidade, data: new Date().toISOString() });
      form.reset(); Object.keys(campos).forEach((n) => erro(n, ""));
      fb.className = "feedback feedback-sucesso";
      fb.replaceChildren(el("p", "", salvou
        ? `Inscrição demonstrativa registrada para ${b.nome}. Nenhum SMS, WhatsApp, e-mail ou push será enviado.`
        : `Inscrição demonstrativa concluída para ${b.nome}, mas este navegador não permitiu guardar o cadastro. Nenhum alerta real será enviado.`));
      fb.hidden = false;
      toast("Inscrição demonstrativa registrada.", "sucesso");
    });
  }

  /* ---------- 13. Comunidade --------------------------------------------- */
  function renderComunidade() {
    const lista = ocorrenciasVisiveis();
    $("#com-total").textContent = String(lista.length);
    $("#com-abertas").textContent = String(lista.filter((o) => o.status !== "resolvida").length);
    const porTipo = $("#com-tipos"); porTipo.replaceChildren();
    const max = Math.max(1, ...Object.keys(TIPOS).map((t) => lista.filter((o) => o.tipo === t).length));
    Object.entries(TIPOS).forEach(([t, nome]) => {
      const n = lista.filter((o) => o.tipo === t).length;
      const linha = el("div", "bar-row");
      const barra = el("div", "barra"); barra.setAttribute("aria-hidden", "true");
      const pre = el("span"); pre.style.width = `${(n / max) * 100}%`; barra.append(pre);
      linha.append(el("span", "", nome), el("strong", "", String(n)), barra);
      porTipo.append(linha);
    });
    const porBairro = $("#com-bairros"); porBairro.replaceChildren();
    const contagem = bairrosVisiveis().map((b) => ({ b, n: lista.filter((o) => o.bairroId === b.id).length })).filter((x) => x.n > 0).sort((a, c) => c.n - a.n).slice(0, 5);
    if (!contagem.length) porBairro.append(el("li", "empty", "Ainda não há relatos para mostrar."));
    contagem.forEach(({ b, n }) => {
      const li = el("li", "contact"); li.append(el("span", "", `${b.nome}, ${b.cidade}`), el("strong", "", String(n))); porBairro.append(li);
    });
    renderOrientacoes($("#com-orientacoes"));
  }

  /* ---------- 14. Configurações ------------------------------------------ */
  function renderConfig() {
    $("#cfg-nome").value = state.config.nome;
    const cid = $("#cfg-cidade"); cid.value = state.config.cidade;
    const grupo = $("#cfg-bairros"); grupo.replaceChildren();
    state.bairros.forEach((b) => {
      const label = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.value = String(b.id);
      cb.checked = state.config.acompanhados.includes(b.id);
      label.append(cb, el("span", "", `${b.nome} (${b.cidade})`)); grupo.append(label);
    });
  }

  function iniciarConfig() {
    Array.from(new Set(BAIRROS.map((b) => b.cidade))).forEach((c) => { const o = el("option", "", c); o.value = c; $("#cfg-cidade").append(o); });
    $("#form-config").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const nome = $("#cfg-nome").value.trim();
      if (nome.length > 60) { $("#erro-cfg-nome").textContent = "Use no máximo 60 caracteres."; return; }
      $("#erro-cfg-nome").textContent = "";
      state.config.nome = nome;
      state.config.cidade = $("#cfg-cidade").value;
      state.config.acompanhados = $$("#cfg-bairros input:checked").map((i) => Number(i.value));
      state.cidade = state.config.cidade; $("#sel-cidade").value = state.cidade;
      const salvou = salvarJSON(STORAGE.config, state.config);
      renderTudo(); ajustarMapa();
      toast(salvou ? "Preferências salvas neste navegador." : "Preferências aplicadas, mas não foi possível salvá-las.", salvou ? "sucesso" : "erro");
    });
    $("#cfg-demo").addEventListener("click", restaurarDemo);
    const confirmar = $("#cfg-limpar-confirma");
    $("#cfg-limpar").addEventListener("click", () => { confirmar.hidden = false; $("#cfg-limpar-sim").focus(); });
    $("#cfg-limpar-nao").addEventListener("click", () => { confirmar.hidden = true; $("#cfg-limpar").focus(); });
    $("#cfg-limpar-sim").addEventListener("click", () => {
      Object.values(STORAGE).forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } });
      state.bairros = BAIRROS.map((b) => Object.assign({}, b));
      state.config = { nome: "", cidade: "", acompanhados: [] }; state.cidade = ""; $("#sel-cidade").value = "";
      state.ocorrencias = []; state.alertas = [];
      state.local = null; state.fuga.destino = "";
      confirmar.hidden = true;
      renderTudo(); ajustarMapa();
      toast("Dados locais apagados.", "sucesso");
    });
  }

  function restaurarDemo() {
    state.bairros = BAIRROS.map((b) => Object.assign({}, b));
    state.ocorrencias = criarOcorrenciasDemo();
    state.alertas = criarAlertasIniciais();
    salvarChuva(); salvarOcorrencias(); salvarAlertas();
    renderTudo();
    toast("Dados de demonstração restaurados.", "sucesso");
  }

  /* ---------- 15. Renderização geral ------------------------------------- */
  function renderTudo() {
    popularSelectBairros($("#occ-bairro"), false);
    popularSelectBairros($("#occ-filtro-bairro"), true, "Todos os bairros");
    popularSelectBairros($("#alerta-bairro"), true, "Todos os bairros");
    popularSelectBairros($("#bairro"), false);
    renderMonitoramento(); renderOcorrencias(); renderComunidade();
    renderPainelNotificacoes(); renderAlertasView(); atualizarContadores();
    renderMapa(); renderPainelBairro(); renderConfig(); renderLocais(false);
    const nome = state.config.nome;
    $("#perfil-nome").textContent = nome || "Visitante";
    $("#perfil-avatar").textContent = iniciais(nome || "Visitante");
  }

  /* ---------- 16. Inicialização ------------------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    carregarEstado();
    iniciarShell();
    iniciarMapa();
    iniciarControlesMapa();
    iniciarMonitoramento();
    iniciarOcorrencias();
    iniciarAlertas();
    iniciarConfig();
    iniciarLocais();
    renderTudo();
    window.addEventListener("hashchange", () => rotear(true));
    rotear(false);
  });
})();
