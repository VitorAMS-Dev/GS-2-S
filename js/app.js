/* ==========================================================================
   AlertaBairro — aplicativo (solucao.html)
   Painel com navegação por hash, mapa Leaflet, relatos comunitários, alertas
   simulados e configurações. Depende de js/main.js (namespace AB) e do Leaflet.
   Tudo é DEMONSTRATIVO: dados simulados, armazenamento no navegador (LocalStorage),
   nenhum envio real de SMS, WhatsApp, e-mail ou push.
   ========================================================================== */
'use strict';

(function () {
  if (!window.AB || !document.getElementById("app-root")) return;
  const { BAIRROS, STORAGE, $, $$, criarElemento: el, formatarNumero: fmt, normalizarTexto, lerJSON, salvarJSON } = window.AB;

  /* ---------- 1. Constantes ---------------------------------------------- */
  const VIEWS = {
    "visao-geral": "Visão geral",
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
  const RAIO_BAIRRO_M = { Baixo: 900, Moderado: 1200, Alto: 1500 };
  const DISTANCIA_MAX_KM = 8;
  const ICONES_TIPO = { alagamento: "droplet", enchente: "cloud-rain", deslizamento: "alert", via_interditada: "pin", acumulo_agua: "droplet", outros: "info" };

  const TILES = {
    padrao: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; colaboradores do OpenStreetMap", max: 19 },
    satelite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagens &copy; Esri, Maxar, Earthstar Geographics e comunidade GIS", max: 18 }
  };

  /* ---------- 2. Estado --------------------------------------------------- */
  const state = {
    view: "visao-geral",
    cidade: "",
    bairros: BAIRROS.map((b) => Object.assign({}, b)),
    ocorrencias: [],
    alertas: [],
    config: { nome: "", cidade: "", acompanhados: [] },
    base: "padrao",
    camadas: { bairros: true, ocorrencias: true },
    pick: false,
    rascunho: null, // { lat, lng } marcado no mapa para o relato
    bairroSelecionado: null,
    filtroMon: { busca: "", risco: "" },
    filtroOcc: { bairro: "", tipo: "" },
    alertaBairro: ""
  };
  let mapa = null, tileAtual = null, camadaBairros = null, camadaOcc = null, marcadorRascunho = null;
  const marcadores = { bairro: new Map(), ocorrencia: new Map() };
  let avisouTiles = false;
  let mapaAjustado = false;

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
  }

  /* ---------- 6. Roteamento ---------------------------------------------- */
  function viewDoHash() {
    const nome = location.hash.replace("#", "");
    return VIEWS[nome] ? nome : "visao-geral";
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

  /* ---------- 8. Mapa ----------------------------------------------------- */
  function popupBairro(b) {
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

  function popupOcorrencia(o) {
    const b = bairroPorId(o.bairroId);
    const box = el("div", "popup-box");
    box.append(el("span", `badge badge-${o.gravidade === "alta" ? "alto" : o.gravidade === "media" ? "moderado" : "baixo"}`, `Gravidade ${GRAVIDADES[o.gravidade].toLowerCase()}`));
    box.append(el("h3", "", TIPOS[o.tipo]), el("p", "muted", `${b ? b.nome : ""}, ${formatarDataHora(o.data)}`), el("p", "", o.descricao));
    box.append(el("p", "muted", "Relato comunitário não verificado. Não é confirmação oficial."));
    return box;
  }

  function iniciarMapa() {
    const container = $("#mapa");
    if (typeof L === "undefined") {
      container.replaceChildren(el("p", "map-fallback", "Não foi possível carregar o mapa. Verifique se a pasta lib/leaflet existe e recarregue a página."));
      return;
    }
    mapa = L.map(container, { zoomControl: true, minZoom: 3, worldCopyJump: false });
    camadaBairros = L.layerGroup();
    camadaOcc = L.layerGroup();
    trocarBase(state.base);
    mapa.on("click", (e) => { if (state.pick) definirLocalNoMapa(e.latlng); });
    ajustarMapa();
    renderMapa();
  }

  function trocarBase(tipo) {
    state.base = tipo;
    if (mapa) {
      if (tileAtual) mapa.removeLayer(tileAtual);
      const t = TILES[tipo];
      tileAtual = L.tileLayer(t.url, { attribution: t.attr, maxZoom: t.max });
      tileAtual.on("tileerror", () => {
        if (!avisouTiles) { avisouTiles = true; toast("Não foi possível carregar o mapa de fundo. Verifique sua conexão.", "erro"); }
      });
      tileAtual.addTo(mapa);
      tileAtual.bringToBack();
    }
    $$("#base-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.base === tipo)));
  }

  function renderMapa() {
    if (!mapa) return;
    camadaBairros.clearLayers(); camadaOcc.clearLayers();
    marcadores.bairro.clear(); marcadores.ocorrencia.clear();
    const cores = { Baixo: "#2fa36b", Moderado: "#f2b230", Alto: "#d6453d" };
    bairrosVisiveis().forEach((b) => {
      const area = L.circle([b.lat, b.lng], { radius: RAIO_BAIRRO_M[b.risco], color: cores[b.risco], fillColor: cores[b.risco], fillOpacity: 0.28, weight: 2, interactive: false });
      const icon = L.divIcon({ className: "", html: `<div class="pin ${classe(b.risco)}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
      const m = L.marker([b.lat, b.lng], { icon, title: `${b.nome}, risco ${b.risco}`, alt: `${b.nome}, risco ${b.risco}`, keyboard: true });
      m.bindPopup(() => popupBairro(b));
      m.on("click", () => { state.bairroSelecionado = b.id; renderPainelBairro(); });
      camadaBairros.addLayer(area); camadaBairros.addLayer(m);
      marcadores.bairro.set(b.id, m);
    });
    ocorrenciasVisiveis().forEach((o) => {
      const icon = L.divIcon({ className: "", html: `<div class="pin-occ ${o.gravidade}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
      const m = L.marker([o.lat, o.lng], { icon, title: `${TIPOS[o.tipo]} (relato comunitário)`, alt: `${TIPOS[o.tipo]}, relato comunitário não verificado`, keyboard: true });
      m.bindPopup(() => popupOcorrencia(o));
      camadaOcc.addLayer(m);
      marcadores.ocorrencia.set(o.id, m);
    });
    aplicarCamadas();
  }

  function aplicarCamadas() {
    if (!mapa) return;
    [[camadaBairros, state.camadas.bairros], [camadaOcc, state.camadas.ocorrencias]].forEach(([camada, ativa]) => {
      if (ativa && !mapa.hasLayer(camada)) camada.addTo(mapa);
      if (!ativa && mapa.hasLayer(camada)) mapa.removeLayer(camada);
    });
  }

  function ajustarMapa() {
    if (!mapa) return;
    const pontos = bairrosVisiveis().map((b) => [b.lat, b.lng]);
    if (!pontos.length) return;
    mapa.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: state.cidade ? 12 : 5, animate: false });
  }

  // O mesmo cartão de mapa é movido entre "Visão geral" e "Mapa inteligente".
  function posicionarMapa() {
    const card = $("#map-card");
    if (!card) return;
    const destino = state.view === "mapa" ? $("#slot-mapa-grande") : state.view === "visao-geral" ? $("#slot-mapa-geral") : null;
    if (destino && card.parentElement !== destino) destino.append(card);
    card.classList.toggle("is-full", state.view === "mapa");
    card.hidden = !destino;
    if (mapa && destino) {
      setTimeout(() => {
        mapa.invalidateSize();
        if (!mapaAjustado) { ajustarMapa(); mapaAjustado = true; }
      }, 60);
    }
    renderPainelBairro();
  }

  function focarBairro(id, abrirPopup = true) {
    const b = bairroPorId(id);
    if (!b) return;
    state.bairroSelecionado = b.id;
    irPara("mapa");
    if (mapa) {
      setTimeout(() => {
        mapa.invalidateSize();
        mapa.flyTo([b.lat, b.lng], 14, { duration: 0.8 });
        const m = marcadores.bairro.get(b.id);
        if (m && abrirPopup) m.openPopup();
      }, 80);
    }
    renderPainelBairro();
  }

  function focarOcorrencia(id) {
    const o = state.ocorrencias.find((x) => x.id === id);
    if (!o) return;
    irPara("mapa");
    if (mapa) {
      setTimeout(() => {
        mapa.invalidateSize();
        mapa.flyTo([o.lat, o.lng], 15, { duration: 0.8 });
        const m = marcadores.ocorrencia.get(id);
        if (m) m.openPopup();
      }, 80);
    }
  }

  function renderPainelBairro() {
    const painel = $("#painel-bairro");
    if (!painel) return;
    painel.replaceChildren();
    const b = bairroPorId(state.bairroSelecionado);
    if (!b) {
      painel.append(el("h2", "", "Bairro selecionado"), el("p", "muted", "Clique em um marcador do mapa ou use a busca para ver os detalhes do bairro."));
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
    $("#camada-bairros").addEventListener("change", (e) => { state.camadas.bairros = e.target.checked; aplicarCamadas(); });
    $("#camada-ocorrencias").addEventListener("change", (e) => { state.camadas.ocorrencias = e.target.checked; aplicarCamadas(); });
    $("#pick-cancelar").addEventListener("click", () => cancelarSelecaoNoMapa(true));
  }

  /* ---------- 9. Seleção de local no mapa (relatos) ---------------------- */
  function iniciarSelecaoNoMapa() {
    if (!mapa) { toast("O mapa não está disponível. Use a localização do bairro.", "erro"); return; }
    state.pick = true;
    $("#pick-banner").hidden = false;
    $("#mapa").style.cursor = "crosshair";
    irPara("mapa");
  }

  function cancelarSelecaoNoMapa(voltar) {
    state.pick = false;
    $("#pick-banner").hidden = true;
    if ($("#mapa")) $("#mapa").style.cursor = "";
    if (voltar) irPara("ocorrencias");
  }

  function definirLocalNoMapa(latlng) {
    state.rascunho = { lat: latlng.lat, lng: latlng.lng };
    if (marcadorRascunho) mapa.removeLayer(marcadorRascunho);
    marcadorRascunho = L.marker(latlng, { icon: L.divIcon({ className: "", html: '<div class="pin-draft"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(mapa);
    cancelarSelecaoNoMapa(true);
    renderLocalRelato();
    toast("Local marcado no mapa.", "sucesso");
  }

  function limparLocalRascunho() {
    state.rascunho = null;
    if (marcadorRascunho && mapa) { mapa.removeLayer(marcadorRascunho); marcadorRascunho = null; }
    renderLocalRelato();
  }

  function renderLocalRelato() {
    const box = $("#occ-local");
    box.replaceChildren();
    box.append(icone("pin"));
    if (state.rascunho) {
      box.append(el("span", "", `Local marcado no mapa: ${state.rascunho.lat.toFixed(4)}, ${state.rascunho.lng.toFixed(4)}`));
      box.append(botao("Remover marcação", "btn-secondary btn-sm", limparLocalRascunho));
    } else {
      box.append(el("span", "", "Sem marcação: será usada a localização aproximada do bairro."));
    }
    box.append(botao("Marcar no mapa", "btn-secondary btn-sm", iniciarSelecaoNoMapa, "map"));
  }

  /* ---------- 10. Visão geral e monitoramento ---------------------------- */
  function saudacao() {
    const h = new Date().getHours();
    const periodo = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    return state.config.nome ? `${periodo}, ${state.config.nome.split(/\s+/)[0]}` : periodo;
  }

  function renderVisaoGeral() {
    const lista = bairrosVisiveis();
    const altos = lista.filter((b) => b.risco === "Alto").length;
    const local = state.cidade || "todas as cidades";
    $("#saudacao").textContent = saudacao();
    $("#resumo-geral").textContent = `${altos} ${altos === 1 ? "bairro" : "bairros"} com risco alto no cenário simulado (${local}).`;
    const total = lista.length;
    const mediaT = total ? lista.reduce((s, b) => s + b.temperatura, 0) / total : 0;
    const mediaC = total ? lista.reduce((s, b) => s + b.chuva, 0) / total : 0;
    $("#kpi-total").textContent = String(total);
    $("#kpi-alto").textContent = String(altos);
    $("#kpi-chuva").textContent = `${fmt(mediaC)} mm`;
    $("#kpi-temp").textContent = `${fmt(mediaT)} °C`;
    $("#kpi-alto").closest(".kpi").classList.toggle("is-alert", altos > 0);

    const atencao = $("#lista-atencao"); atencao.replaceChildren();
    const ordenados = lista.slice().sort((a, b) => b.chuva - a.chuva).slice(0, 5);
    if (!ordenados.length) atencao.append(el("li", "empty", "Nenhum bairro nesta localização."));
    ordenados.forEach((b) => {
      const li = el("li");
      const item = el("button", `row-item nivel-${classe(b.risco)}`); item.type = "button";
      const main = el("div", "row-main");
      const t = el("div", "row-title"); t.append(el("span", "", b.nome), el("span", `badge badge-${classe(b.risco)}`, b.risco));
      main.append(t, el("p", "row-sub", `${b.cidade}, ${fmt(b.chuva)} mm simulados`));
      item.append(main, icone("pin"));
      item.setAttribute("aria-label", `Ver ${b.nome} no mapa`);
      item.addEventListener("click", () => focarBairro(b.id));
      li.append(item); atencao.append(li);
    });

    const ultimas = $("#lista-ultimas-ocorrencias"); ultimas.replaceChildren();
    const recentes = ocorrenciasVisiveis().slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 3);
    if (!recentes.length) ultimas.append(el("li", "empty", "Ainda não há relatos nesta localização."));
    recentes.forEach((o) => ultimas.append(itemOcorrenciaResumo(o)));

    const recAl = $("#lista-alertas-recentes"); recAl.replaceChildren();
    const rel = alertasRelevantes().filter((a) => !state.cidade || (bairroPorId(a.bairroId) || {}).cidade === state.cidade).slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 3);
    if (!rel.length) recAl.append(el("li", "empty", "Sem alertas recentes."));
    rel.forEach((a) => recAl.append(itemAlerta(a, true)));

    renderOrientacoes($("#lista-orientacoes"));
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
    const ic = el("div", "feature-icon"); ic.style.margin = "0"; ic.append(icone(ICONES_TIPO[o.tipo] || "info"));
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
    renderOcorrencias(); renderVisaoGeral(); renderComunidade();
    toast(`Status atualizado: ${STATUS[status]}.`, "sucesso");
  }

  function removerOcorrencia(id) {
    state.ocorrencias = state.ocorrencias.filter((o) => o.id !== id);
    salvarOcorrencias();
    renderOcorrencias(); renderVisaoGeral(); renderMapa(); renderComunidade(); atualizarContadores();
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
        e.bairro = `O ponto marcado fica a mais de ${DISTANCIA_MAX_KM} km de ${b.nome}. Escolha outro bairro ou marque outro local.`;
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
    renderVisaoGeral();
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
    renderVisaoGeral(); renderMonitoramento(); renderOcorrencias(); renderComunidade();
    renderPainelNotificacoes(); renderAlertasView(); atualizarContadores();
    renderMapa(); renderPainelBairro(); renderConfig();
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
    renderTudo();
    window.addEventListener("hashchange", () => rotear(true));
    rotear(false);
  });
})();
