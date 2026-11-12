/* AlertaBairro — ferramentas de acessibilidade (todas as páginas).
   Ajuste do tamanho do texto e modo de alto contraste, lembrados no navegador.
   As preferências viram atributos no <html> (data-fonte, data-contraste); o visual fica no CSS. */
(function () {
  "use strict";

  const CHAVE = "alertabairro:acessibilidade";
  const FONTE_MIN = 0;
  const FONTE_MAX = 3;
  const raiz = document.documentElement;

  function lerPreferencias() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      const fonte = Number.isInteger(salvo && salvo.fonte) ? Math.min(FONTE_MAX, Math.max(FONTE_MIN, salvo.fonte)) : 0;
      return { fonte, contraste: Boolean(salvo && salvo.contraste) };
    } catch (erro) {
      return { fonte: 0, contraste: false };
    }
  }

  function salvarPreferencias(prefs) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(prefs));
    } catch (erro) {
      // Sem armazenamento (modo privado, por exemplo): a preferência vale só nesta página.
    }
  }

  const prefs = lerPreferencias();

  function aplicar() {
    raiz.setAttribute("data-fonte", String(prefs.fonte));
    if (prefs.contraste) raiz.setAttribute("data-contraste", "alto");
    else raiz.removeAttribute("data-contraste");
  }

  aplicar(); // antes do carregamento da página, para não piscar

  function criarBotao(texto, rotulo, aoClicar) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "acess-botao";
    botao.textContent = texto;
    botao.setAttribute("aria-label", rotulo);
    botao.addEventListener("click", aoClicar);
    return botao;
  }

  function montarFerramentas() {
    const aviso = document.querySelector(".notice-bar");
    if (!aviso) return;

    const grupo = document.createElement("div");
    grupo.className = "acess-ferramentas";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Ferramentas de acessibilidade");

    const status = document.createElement("span");
    status.className = "sr-only";
    status.setAttribute("role", "status");

    const menos = criarBotao("A\u2212", "Diminuir o tamanho do texto", () => ajustarFonte(-1));
    const mais = criarBotao("A+", "Aumentar o tamanho do texto", () => ajustarFonte(1));
    const contraste = criarBotao("Alto contraste", "Alto contraste", () => {
      prefs.contraste = !prefs.contraste;
      atualizar(prefs.contraste ? "Alto contraste ligado" : "Alto contraste desligado");
    });

    function ajustarFonte(passo) {
      const nova = Math.min(FONTE_MAX, Math.max(FONTE_MIN, prefs.fonte + passo));
      if (nova === prefs.fonte) {
        status.textContent = passo > 0 ? "Tamanho máximo do texto" : "Tamanho mínimo do texto";
        return;
      }
      prefs.fonte = nova;
      atualizar(`Tamanho do texto: nível ${nova + 1} de ${FONTE_MAX + 1}`);
    }

    function atualizar(mensagem) {
      aplicar();
      salvarPreferencias(prefs);
      menos.disabled = prefs.fonte === FONTE_MIN;
      mais.disabled = prefs.fonte === FONTE_MAX;
      contraste.setAttribute("aria-pressed", String(prefs.contraste));
      status.textContent = mensagem || "";
    }

    grupo.append(menos, mais, contraste, status);
    aviso.append(grupo);
    atualizar("");
  }

  document.addEventListener("DOMContentLoaded", montarFerramentas);
})();
