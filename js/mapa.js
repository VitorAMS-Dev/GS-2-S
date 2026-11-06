/* ==========================================================================
   AlertaBairro — mapa próprio (js/mapa.js)
   JavaScript puro, sem biblioteca. O fundo é formado por imagens (<img>) do
   OpenStreetMap; áreas coloridas e marcadores são elementos HTML posicionados
   por cálculo de coordenadas (projeção Web Mercator).
   Recursos: arrastar, zoom (botões, roda do mouse, duplo clique, teclado),
   áreas, marcadores clicáveis, clique no mapa e rota em linha reta (setRota).
   ========================================================================== */
'use strict';

(function () {
  const TAM = 256;            // lado de cada imagem do mapa, em pixels
  const Z_MIN = 3, Z_MAX = 18;
  // ===== CONFIGURAÇÃO DOS TILES =====
  // Sem chave: usa o servidor do OpenStreetMap (grátis, só para uso leve/demonstração). Ele exige que a página
  // seja aberta por http(s) (site hospedado ou servidor local), pois bloqueia com 403 acessos sem Referer (file://).
  // Com chave: cole abaixo a chave do MapTiler (maptiler.com, plano grátis) e o mapa passa a funcionar em qualquer cenário.
  const MAPTILER_KEY = "";
  const urlTile = (z, x, y) => MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/256/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`
    : location.protocol === "file:"
      ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}` // sem chave; funciona abrindo o arquivo direto
      : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const FONTE_ESRI = !MAPTILER_KEY && location.protocol === "file:";
  const limitar = (n, a, b) => Math.max(a, Math.min(b, n));

  // latitude/longitude -> pixel no "mundo" do nível de zoom z
  function mundoPx(lat, lng, z) {
    const escala = TAM * Math.pow(2, z);
    const s = Math.sin((limitar(lat, -85.0511, 85.0511) * Math.PI) / 180);
    return { x: ((lng + 180) / 360) * escala, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala };
  }

  // pixel no "mundo" -> latitude/longitude
  function paraLatLng(x, y, z) {
    const escala = TAM * Math.pow(2, z);
    const n = Math.PI - (2 * Math.PI * y) / escala;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: (x / escala) * 360 - 180 };
  }

  const metrosPorPx = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);

  function novo(tag, classe) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    return e;
  }

  function criar(container, opcoes) {
    const op = Object.assign({ aoClicar: null, aoErroTiles: null }, opcoes);
    const est = { z: 4, cx: 0, cy: 0, w: 0, h: 0, bx: 0, by: 0 }; // cx, cy: centro em pixels do mundo; bx, by: origem das posições
    const tiles = new Map();
    let areas = [], pinos = [], rota = null, ajustePendente = null, avisouErro = false, arrasto = null, ultimoWheel = 0;

    container.classList.add("mp");
    container.replaceChildren();
    const vista = novo("div", "mp-vista");
    vista.tabIndex = 0;
    vista.setAttribute("role", "application");
    vista.setAttribute("aria-label", "Mapa interativo. Use as setas para mover e as teclas + e - para aproximar ou afastar.");
    const capa = novo("div", "mp-capa");
    const camTiles = novo("div", "mp-tiles");
    const camAreas = novo("div", "mp-areas");
    const camPinos = novo("div", "mp-pinos");
    // Camada da rota: linha reta em SVG (atributos, sem estilo inline), entre as áreas e os marcadores.
    const NS = "http://www.w3.org/2000/svg";
    const camRota = document.createElementNS(NS, "svg");
    camRota.setAttribute("class", "mp-rota");
    camRota.setAttribute("width", "1");
    camRota.setAttribute("height", "1");
    camRota.setAttribute("aria-hidden", "true");
    camRota.setAttribute("focusable", "false");
    camRota.setAttribute("hidden", "");
    const rotaFundo = document.createElementNS(NS, "line");
    const rotaLinha = document.createElementNS(NS, "line");
    const rotaSeta = document.createElementNS(NS, "polygon");
    rotaFundo.setAttribute("class", "mp-rota-fundo");
    rotaLinha.setAttribute("class", "mp-rota-linha");
    rotaSeta.setAttribute("class", "mp-rota-seta");
    camRota.append(rotaFundo, rotaLinha, rotaSeta);
    capa.append(camTiles, camAreas, camRota, camPinos);
    vista.append(capa);

    const ctl = novo("div", "mp-ctl");
    const mais = novo("button"), menos = novo("button");
    mais.type = menos.type = "button";
    mais.textContent = "+"; menos.textContent = "−";
    mais.setAttribute("aria-label", "Aproximar o mapa");
    menos.setAttribute("aria-label", "Afastar o mapa");
    ctl.append(mais, menos);

    const attr = novo("div", "mp-attr");
    const lk = novo("a");
    lk.href = "https://www.openstreetmap.org/copyright";
    lk.target = "_blank"; lk.rel = "noopener noreferrer";
    lk.textContent = "colaboradores do OpenStreetMap";
    attr.append(document.createTextNode("© "), lk);
    if (FONTE_ESRI) attr.append(document.createTextNode(" · Esri"));
    if (MAPTILER_KEY) {
      const lk2 = novo("a");
      lk2.href = "https://www.maptiler.com/copyright/";
      lk2.target = "_blank"; lk2.rel = "noopener noreferrer";
      lk2.textContent = "MapTiler";
      attr.append(document.createTextNode(" © "), lk2);
    }

    container.append(vista, ctl, attr);

    /* ---- desenho ---- */
    function posicionarCamadas() {
      tiles.forEach((t) => { t.el.style.left = `${t.tx * TAM - est.bx}px`; t.el.style.top = `${t.ty * TAM - est.by}px`; });
      areas.forEach((a) => {
        const p = mundoPx(a.dados.lat, a.dados.lng, est.z);
        const r = Math.max(a.dados.raioM / metrosPorPx(a.dados.lat, est.z), 14); // mínimo de 14 px para a área aparecer mesmo com o mapa afastado
        a.el.style.width = a.el.style.height = `${2 * r}px`;
        a.el.style.left = `${p.x - est.bx - r}px`;
        a.el.style.top = `${p.y - est.by - r}px`;
      });
      pinos.forEach((p) => {
        const q = mundoPx(p.dados.lat, p.dados.lng, est.z);
        p.el.style.left = `${q.x - est.bx}px`;
        p.el.style.top = `${q.y - est.by}px`;
      });
      posicionarRota();
    }

    function posicionarRota() {
      if (rota) camRota.removeAttribute("hidden"); else camRota.setAttribute("hidden", "");
      if (!rota) return;
      const a = mundoPx(rota.de.lat, rota.de.lng, est.z), b = mundoPx(rota.para.lat, rota.para.lng, est.z);
      const x1 = a.x - est.bx, y1 = a.y - est.by, x2 = b.x - est.bx, y2 = b.y - est.by;
      [rotaFundo, rotaLinha].forEach((l) => {
        l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      });
      // Seta de direção no meio do trajeto (só aparece se a linha for longa o bastante).
      const comp = Math.hypot(x2 - x1, y2 - y1);
      if (comp < 60) { rotaSeta.setAttribute("points", ""); return; }
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const mx = x1 + (x2 - x1) * 0.55, my = y1 + (y2 - y1) * 0.55;
      const ponta = [mx + Math.cos(ang) * 11, my + Math.sin(ang) * 11];
      const base = [mx - Math.cos(ang) * 9, my - Math.sin(ang) * 9];
      const lado = [Math.sin(ang) * 9, -Math.cos(ang) * 9];
      rotaSeta.setAttribute("points", `${ponta[0]},${ponta[1]} ${base[0] + lado[0]},${base[1] + lado[1]} ${base[0] - lado[0]},${base[1] - lado[1]}`);
    }

    function setRota(nova) {
      rota = nova || null;
      posicionarRota();
    }

    function atualizarTiles(tlx, tly) {
      const n = Math.pow(2, est.z);
      const x0 = Math.floor(tlx / TAM) - 1, x1 = Math.floor((tlx + est.w) / TAM) + 1;
      const y0 = Math.floor(tly / TAM) - 1, y1 = Math.floor((tly + est.h) / TAM) + 1;
      const manter = new Set();
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = x0; tx <= x1; tx++) {
          const chave = `${est.z}/${tx}/${ty}`;
          manter.add(chave);
          if (tiles.has(chave)) continue;
          const wx = ((tx % n) + n) % n;
          const img = novo("img", "mp-tile");
          img.alt = ""; img.draggable = false;
          img.referrerPolicy = "strict-origin-when-cross-origin";
          img.src = urlTile(est.z, wx, ty);
          img.style.left = `${tx * TAM - est.bx}px`;
          img.style.top = `${ty * TAM - est.by}px`;
          img.addEventListener("error", () => {
            img.classList.add("mp-erro");
            if (!avisouErro) { avisouErro = true; if (op.aoErroTiles) op.aoErroTiles(); }
          });
          camTiles.append(img);
          tiles.set(chave, { el: img, tx, ty });
        }
      }
      tiles.forEach((t, chave) => { if (!manter.has(chave)) { t.el.remove(); tiles.delete(chave); } });
    }

    function desenhar() {
      if (!est.w || !est.h) return;
      const tlx = est.cx - est.w / 2, tly = est.cy - est.h / 2;
      const dx = est.bx - tlx, dy = est.by - tly;
      if (Math.abs(dx) > 2500 || Math.abs(dy) > 2500) { rebase(); return; } // evita números muito grandes
      capa.style.transform = `translate(${dx}px, ${dy}px)`;
      atualizarTiles(tlx, tly);
    }

    function rebase() {
      if (!est.w || !est.h) return;
      est.bx = Math.floor(est.cx - est.w / 2);
      est.by = Math.floor(est.cy - est.h / 2);
      posicionarCamadas();
      desenhar();
    }

    function medir() {
      const w = vista.clientWidth, h = vista.clientHeight;
      if (w === est.w && h === est.h) return;
      est.w = w; est.h = h;
      if (!w || !h) return;
      if (ajustePendente) { const f = ajustePendente; ajustePendente = null; f(); return; }
      rebase();
    }

    /* ---- navegação ---- */
    function irPara(lat, lng, zoom) {
      ajustePendente = null;
      est.z = limitar(Math.round(zoom), Z_MIN, Z_MAX);
      const p = mundoPx(lat, lng, est.z);
      est.cx = p.x; est.cy = p.y;
      rebase();
    }

    // Enquadra todos os pontos dentro do mapa.
    function ajustar(pontos, opcoesAjuste) {
      if (!pontos.length) return;
      if (!est.w || !est.h) { ajustePendente = () => ajustar(pontos, opcoesAjuste); return; }
      const o = Object.assign({ margem: 48, zoomMax: 13 }, opcoesAjuste);
      const maxW = Math.max(est.w - 2 * o.margem, 50), maxH = Math.max(est.h - 2 * o.margem, 50);
      let z = Z_MIN;
      for (let t = Math.min(Z_MAX, o.zoomMax); t >= Z_MIN; t--) {
        const ps = pontos.map((p) => mundoPx(p.lat, p.lng, t));
        const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
        if (Math.max(...xs) - Math.min(...xs) <= maxW && Math.max(...ys) - Math.min(...ys) <= maxH) { z = t; break; }
      }
      const ps = pontos.map((p) => mundoPx(p.lat, p.lng, z));
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      est.z = z;
      est.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      est.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      rebase();
    }

    function zoomPara(novoZ, ax, ay) {
      const nz = limitar(novoZ, Z_MIN, Z_MAX);
      if (nz === est.z || !est.w) return;
      const ancoraX = ax === undefined ? est.w / 2 : ax, ancoraY = ay === undefined ? est.h / 2 : ay;
      const f = Math.pow(2, nz - est.z);
      const wx = est.cx - est.w / 2 + ancoraX, wy = est.cy - est.h / 2 + ancoraY; // ponto do mundo sob a âncora
      est.z = nz;
      est.cx = wx * f - (ancoraX - est.w / 2);
      est.cy = wy * f - (ancoraY - est.h / 2);
      rebase();
    }

    function mover(dx, dy) {
      const limite = TAM * Math.pow(2, est.z);
      est.cx = limitar(est.cx - dx, 0, limite);
      est.cy = limitar(est.cy - dy, 0, limite);
      desenhar();
    }

    /* ---- camadas ---- */
    function setCamadas(novasAreas, novosPinos) {
      const indiceFoco = pinos.findIndex((p) => p.el === document.activeElement);
      areas = novasAreas.map((a) => ({ dados: a, el: novo("div", `mp-area ${a.classe}`) }));
      pinos = novosPinos.map((p) => {
        let el;
        if (p.aoClicar) {
          el = novo("button", `mp-pino${p.ativo ? " ativo" : ""}`);
          el.type = "button";
          el.setAttribute("aria-label", p.rotulo);
          el.addEventListener("click", (e) => { e.stopPropagation(); p.aoClicar(); });
        } else { // marcador apenas informativo
          el = novo("div", "mp-pino fixo");
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", p.rotulo);
        }
        el.title = p.rotulo;
        el.append(novo("span", p.classe));
        return { dados: p, el };
      });
      camAreas.replaceChildren(...areas.map((a) => a.el));
      camPinos.replaceChildren(...pinos.map((p) => p.el));
      posicionarCamadas();
      if (indiceFoco >= 0 && pinos[indiceFoco] && pinos[indiceFoco].el.focus) pinos[indiceFoco].el.focus({ preventScroll: true });
    }

    /* ---- eventos ---- */
    vista.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      arrasto = { x: e.clientX, y: e.clientY, moveu: false };
      vista.setPointerCapture(e.pointerId);
      vista.classList.add("arrastando");
    });
    vista.addEventListener("pointermove", (e) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrasto.moveu = true;
      arrasto.x = e.clientX; arrasto.y = e.clientY;
      mover(dx, dy);
    });
    const soltar = (e) => {
      if (!arrasto) return;
      const foiClique = !arrasto.moveu && e.type === "pointerup";
      arrasto = null;
      vista.classList.remove("arrastando");
      if (foiClique && op.aoClicar) {
        const r = vista.getBoundingClientRect();
        op.aoClicar(paraLatLng(est.cx - est.w / 2 + (e.clientX - r.left), est.cy - est.h / 2 + (e.clientY - r.top), est.z));
      }
    };
    vista.addEventListener("pointerup", soltar);
    vista.addEventListener("pointercancel", soltar);

    vista.addEventListener("wheel", (e) => {
      e.preventDefault();
      const agora = Date.now();
      if (agora - ultimoWheel < 200) return;
      ultimoWheel = agora;
      const r = vista.getBoundingClientRect();
      zoomPara(est.z + (e.deltaY < 0 ? 1 : -1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    vista.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      const r = vista.getBoundingClientRect();
      zoomPara(est.z + 1, e.clientX - r.left, e.clientY - r.top);
    });

    vista.addEventListener("keydown", (e) => {
      if (e.target !== vista) return; // setas só movem o mapa quando ele próprio está focado
      const passo = 80;
      const acoes = {
        ArrowLeft: () => mover(passo, 0), ArrowRight: () => mover(-passo, 0),
        ArrowUp: () => mover(0, passo), ArrowDown: () => mover(0, -passo),
        "+": () => zoomPara(est.z + 1), "=": () => zoomPara(est.z + 1), "-": () => zoomPara(est.z - 1)
      };
      if (acoes[e.key]) { e.preventDefault(); acoes[e.key](); }
    });

    mais.addEventListener("click", () => zoomPara(est.z + 1));
    menos.addEventListener("click", () => zoomPara(est.z - 1));

    if (typeof ResizeObserver !== "undefined") new ResizeObserver(medir).observe(vista);
    window.addEventListener("resize", medir);
    medir();

    return { irPara, ajustar, setCamadas, setRota, redimensionar: medir };
  }

  window.MapaProprio = { criar };
})();
