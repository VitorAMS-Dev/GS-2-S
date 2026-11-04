/* ==========================================================================
   AlertaBairro — Global Solution FIAP 2026/2 (CitizenTech)
   Módulo compartilhado por todas as páginas (namespace global AB).
   - Base de dados SIMULADA dos bairros, utilitários, armazenamento local
     e validações reutilizadas pelo aplicativo (js/app.js).
   - Menu do site público, prévia da página inicial e contadores de impacto.
   ATENÇÃO: chuva, temperatura e risco são SIMULADOS (dados demonstrativos para
   fins acadêmicos). As coordenadas são aproximadas e servem só para o mapa.
   ========================================================================== */
'use strict';

(function () {
  /* ---------- 1. Dados (simulados) --------------------------------------- */
  // Limiares de chuva (mm) usados para calcular o nível de risco simulado.
  const LIMIAR_ALTO = 70;
  const LIMIAR_MODERADO = 40;

  function nivelPorChuva(chuva) {
    if (chuva >= LIMIAR_ALTO) return "Alto";
    if (chuva >= LIMIAR_MODERADO) return "Moderado";
    return "Baixo";
  }

  const BAIRROS_BASE = [
    { id: 1,  nome: "Jardim Ângela", cidade: "São Paulo",      lat: -23.7106, lng: -46.7778, chuva: 82.5, temperatura: 24, orientacao: "Evite áreas alagadas e acompanhe os comunicados da Defesa Civil." },
    { id: 2,  nome: "Brasilândia",   cidade: "São Paulo",      lat: -23.4550, lng: -46.6930, chuva: 91.0, temperatura: 22, orientacao: "Em encostas, observe rachaduras e, havendo orientação oficial, deixe o local com antecedência." },
    { id: 3,  nome: "Pinheiros",     cidade: "São Paulo",      lat: -23.5670, lng: -46.6920, chuva: 48.3, temperatura: 25, orientacao: "Evite atravessar ruas alagadas e mantenha objetos importantes em local elevado." },
    { id: 4,  nome: "Madureira",     cidade: "Rio de Janeiro", lat: -22.8730, lng: -43.3370, chuva: 55.7, temperatura: 29, orientacao: "Fique atento a pontos de alagamento e programe trajetos alternativos." },
    { id: 5,  nome: "Tijuca",        cidade: "Rio de Janeiro", lat: -22.9320, lng: -43.2420, chuva: 76.4, temperatura: 27, orientacao: "Próximo a encostas, redobre a atenção após chuvas contínuas e siga as orientações da Defesa Civil." },
    { id: 6,  nome: "Barreiro",      cidade: "Belo Horizonte", lat: -19.9770, lng: -44.0220, chuva: 44.9, temperatura: 23, orientacao: "Mantenha calhas e ralos desobstruídos para ajudar o escoamento da água." },
    { id: 7,  nome: "Savassi",       cidade: "Belo Horizonte", lat: -19.9390, lng: -43.9330, chuva: 18.2, temperatura: 26, orientacao: "Risco baixo no cenário simulado: continue acompanhando a previsão do tempo." },
    { id: 8,  nome: "Liberdade",     cidade: "Salvador",       lat: -12.9520, lng: -38.4880, chuva: 88.1, temperatura: 28, orientacao: "Evite permanecer em áreas de encosta durante chuva forte e conheça a rota de saída mais segura." },
    { id: 9,  nome: "Cajazeiras",    cidade: "Salvador",       lat: -12.8830, lng: -38.4230, chuva: 21.6, temperatura: 30, orientacao: "Risco baixo no cenário simulado: mantenha o contato da Defesa Civil à mão." },
    { id: 10, nome: "Ibura",         cidade: "Recife",         lat: -8.1130,  lng: -34.9440, chuva: 79.8, temperatura: 28, orientacao: "Combine com a família um ponto de encontro seguro e guarde documentos em saco impermeável." },
    { id: 11, nome: "Boa Viagem",    cidade: "Recife",         lat: -8.1190,  lng: -34.8970, chuva: 15.4, temperatura: 31, orientacao: "Risco baixo no cenário simulado: observe mudanças bruscas no tempo, principalmente na maré alta." },
    { id: 12, nome: "Sarandi",       cidade: "Porto Alegre",   lat: -29.9930, lng: -51.1280, chuva: 52.0, temperatura: 20, orientacao: "Acompanhe o nível dos cursos d'água e evite deixar veículos em ruas baixas." }
  ];

  const BAIRROS = BAIRROS_BASE.map((b) => Object.assign({}, b, { risco: nivelPorChuva(b.chuva) }));

  const STORAGE = {
    inscricoes: "alertabairro:inscricoes",
    ocorrencias: "alertabairro:ocorrencias",
    alertas: "alertabairro:alertas",
    config: "alertabairro:config",
    chuva: "alertabairro:chuva"
  };

  // Faixas aproximadas dos 5 primeiros dígitos do CEP por cidade (validação demonstrativa).
  const FAIXAS_CEP = {
    "São Paulo":      [[1000, 5999], [8000, 8499]],
    "Rio de Janeiro": [[20000, 23799]],
    "Belo Horizonte": [[30000, 31999]],
    "Salvador":       [[40000, 42599]],
    "Recife":         [[50000, 52999]],
    "Porto Alegre":   [[90000, 91999]]
  };

  /* ---------- 2. Utilitários --------------------------------------------- */
  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

  function normalizarTexto(texto) {
    return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function formatarNumero(valor, casas = 1) {
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
  }

  // Cria elementos sem usar innerHTML (textContent evita injeção de HTML).
  function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function lerJSON(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (erro) {
      return padrao;
    }
  }

  function salvarJSON(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (erro) {
      return false; // armazenamento indisponível (ex.: navegação privada)
    }
  }

  function lerInscricoes() {
    const lista = lerJSON(STORAGE.inscricoes, []);
    return Array.isArray(lista) ? lista : [];
  }

  function salvarInscricao(inscricao) {
    const lista = lerInscricoes();
    lista.push(inscricao);
    return salvarJSON(STORAGE.inscricoes, lista);
  }

  /* ---------- 3. Validações compartilhadas ------------------------------- */
  function validarNome(valor) {
    const nome = valor.trim();
    if (!nome) return "Informe seu nome completo.";
    if (nome.split(/\s+/).length < 2) return "Digite nome e sobrenome.";
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/.test(nome)) return "O nome deve conter apenas letras.";
    return "";
  }

  function validarEmail(valor) {
    const email = valor.trim();
    if (!email) return "Informe seu e-mail.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Digite um e-mail válido, como nome@exemplo.com.";
    return "";
  }

  function formatarCep(valor) {
    const digitos = valor.replace(/\D/g, "").slice(0, 8);
    return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
  }

  function cepPertenceCidade(cep, cidade) {
    const faixas = FAIXAS_CEP[cidade];
    if (!faixas) return true;
    const prefixo = parseInt(cep.slice(0, 5), 10);
    return faixas.some(([inicio, fim]) => prefixo >= inicio && prefixo <= fim);
  }

  function validarCep(valor) {
    const digitos = valor.replace(/\D/g, "");
    if (!digitos) return "Informe seu CEP.";
    if (digitos.length !== 8) return "O CEP deve ter 8 números, no formato 00000-000.";
    if (/^(\d)\1{7}$/.test(digitos)) return "Digite um CEP válido.";
    return "";
  }

  function validarBairroCep(valorId, cep, bairros) {
    if (!valorId) return "Selecione o bairro da lista.";
    const bairro = (bairros || BAIRROS).find((b) => String(b.id) === valorId);
    if (!bairro) return "O bairro selecionado não está disponível. Escolha outro da lista.";
    const digitos = cep.replace(/\D/g, "");
    if (digitos.length === 8 && !cepPertenceCidade(digitos, bairro.cidade)) {
      return `O CEP informado não parece pertencer a ${bairro.cidade}. Confira o CEP ou o bairro.`;
    }
    return "";
  }

  /* ---------- 4. Site público: menu, prévia e impacto -------------------- */
  function iniciarMenuPublico() {
    const botao = $("#menu-toggle");
    const menu = $("#menu-principal");
    if (!botao || !menu) return;
    const rotulo = $(".sr-only", botao);

    function definirEstado(aberto) {
      menu.classList.toggle("aberto", aberto);
      botao.setAttribute("aria-expanded", String(aberto));
      if (rotulo) rotulo.textContent = aberto ? "Fechar menu" : "Abrir menu";
    }

    botao.addEventListener("click", () => definirEstado(!menu.classList.contains("aberto")));
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) definirEstado(false); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("aberto")) {
        definirEstado(false);
        botao.focus();
      }
    });
    if (window.matchMedia) {
      window.matchMedia("(min-width: 900px)").addEventListener("change", (c) => {
        if (c.matches) definirEstado(false);
      });
    }
  }

  // Prévia do painel na página inicial: usa os mesmos dados simulados do app.
  function iniciarPrevia() {
    const lista = $("#previa-lista");
    if (!lista) return;
    const destaque = BAIRROS.slice().sort((a, b) => b.chuva - a.chuva).slice(0, 4);
    destaque.forEach((b) => {
      const classe = b.risco.toLowerCase();
      const item = criarElemento("li", `risco-${classe}`);
      const texto = criarElemento("div");
      texto.append(criarElemento("strong", "", b.nome), criarElemento("small", "", `${b.cidade}, ${formatarNumero(b.chuva)} mm`));
      item.append(texto, criarElemento("span", `badge badge-${classe}`, `Risco ${b.risco}`));
      lista.append(item);
    });
  }

  function iniciarIndicadoresImpacto() {
    const bairros = $("#meta-bairros");
    const inscricoes = $("#meta-inscricoes");
    const ocorrencias = $("#meta-ocorrencias");
    if (bairros) bairros.textContent = String(BAIRROS.length);
    if (inscricoes) inscricoes.textContent = String(lerInscricoes().length);
    if (ocorrencias) {
      const lista = lerJSON(STORAGE.ocorrencias, []);
      ocorrencias.textContent = String(Array.isArray(lista) ? lista.filter((o) => o.origem === "usuario").length : 0);
    }
  }

  window.AB = {
    BAIRROS, STORAGE, LIMIAR_ALTO, LIMIAR_MODERADO, nivelPorChuva,
    $, $$, normalizarTexto, formatarNumero, criarElemento,
    lerJSON, salvarJSON, lerInscricoes, salvarInscricao,
    validarNome, validarEmail, formatarCep, validarCep, validarBairroCep
  };

  document.addEventListener("DOMContentLoaded", () => {
    iniciarMenuPublico();
    iniciarPrevia();
    iniciarIndicadoresImpacto();
  });
})();
