# AlertaBairro

Plataforma comunitária de monitoramento climático e comunicação preventiva, desenvolvida para a **Global Solution FIAP 2026/2 (CitizenTech)**.

> **Aviso:** os indicadores de chuva, temperatura e risco exibidos no site são **simulados**, apenas para fins acadêmicos. Não são medições reais nem alertas oficiais. Em caso de risco, siga as orientações da Defesa Civil (telefone 199).

## 1. Descrição

O AlertaBairro é uma plataforma comunitária de monitoramento climático e prevenção de desastres. O site institucional apresenta o projeto e o **painel** (`solucao.html`) funciona como um aplicativo prático: ao entrar, a pessoa vê **onde está, em que situação de risco está esse local e como sair dele com urgência**. Há também mapa inteligente, registro comunitário de ocorrências, alertas simulados e configurações. Tudo roda no navegador, sem backend.

## 2. Problema identificado

Moradores de áreas vulneráveis enfrentam enchentes, alagamentos urbanos e deslizamentos, e muitas vezes têm pouco acesso a informações preventivas claras sobre o risco do próprio bairro.

Dado de contexto: cerca de **8,2 milhões de pessoas** viviam em áreas de risco de deslizamentos, inundações e enxurradas nos municípios monitorados pelo Cemaden (estimativa baseada no Censo 2010). Fonte: IBGE e Cemaden, *População em Áreas de Risco no Brasil*, 2018: <https://www.ibge.gov.br/apps/populacaoareasderisco/>.

## 3. Proposta de solução

1. Tela "Onde estou": localização do usuário, nível de risco do local e orientação.
2. Botão fixo "Preciso sair agora" e tela de **rota de fuga** até um destino seguro.
3. Consulta de indicadores climáticos por bairro.
4. Visualização de níveis de risco (baixo, moderado, alto).
5. Identificação de áreas que exigem atenção, com filtros.
6. Cadastro para receber alertas (demonstrativo).
7. Incentivo à prevenção e à colaboração comunitária.

## 4. Objetivo do projeto

Construir um site funcional, responsivo e acessível que demonstre como a tecnologia pode apoiar a prevenção de desastres ambientais, a conscientização comunitária e a proteção de vidas.

## 5. Relação com os ODS

- **ODS 13, Ação contra a Mudança Global do Clima:** adaptação climática, prevenção de desastres, acesso à informação e conscientização.
- **ODS 11, Cidades e Comunidades Sustentáveis:** resiliência urbana, comunidades mais seguras e redução da vulnerabilidade.

## 6. Tecnologias utilizadas

- HTML5 semântico
- CSS3 (Flexbox, Grid, Media Queries, Custom Properties)
- JavaScript Vanilla (manipulação do DOM, navegação por hash)
- `navigator.geolocation` (API nativa do navegador, opcional) para o botão "Usar minha localização". Se não for usada ou for negada, o usuário escolhe o bairro na lista ou toca no mapa
- LocalStorage (relatos, alertas, preferências e inscrições)
- Mapa próprio em JavaScript puro (`js/mapa.js`): imagens do [OpenStreetMap](https://www.openstreetmap.org) (ou do MapTiler, se `MAPTILER_KEY` for definida em `js/mapa.js`) em `<img>` e áreas/marcadores em HTML, posicionados por cálculo de coordenadas (sem biblioteca)
- Mapas do [Google Maps](https://www.google.com/maps) (padrão e satélite) incorporados por `<iframe>` (exigem internet)
- Fonte Manrope via Google Fonts, com fallback para fontes do sistema

Sem frameworks, bibliotecas, CSS inline ou JavaScript inline.

## 7. Estrutura de pastas

```
AlertaBairro/
├── index.html        (site: apresentação)
├── solucao.html      (painel / aplicativo)
├── impacto.html      (site: ODS e impacto)
├── equipe.html       (site: equipe)
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── main.js       (dados dos bairros e dos locais cobertos fictícios, utilitários e validações; menu do site)
│   ├── mapa.js       (mapa próprio: imagens, áreas, marcadores, rota em linha reta, zoom e arraste)
│   └── app.js        (painel: onde estou, rota de fuga, mapa, relatos, alertas, configurações)
└── img/
    └── favicon.svg   (ícone do site)
```

## 8. Funcionalidades

- **Painel (solucao.html):** menu do site no topo (igual ao das outras páginas), sidebar (vira menu lateral no celular, com barra de abas inferior), busca de bairros, filtro por cidade, notificações, perfil e ação rápida. Navegação por hash: onde estou, rota de fuga, monitoramento, mapa, ocorrências, alertas, comunidade e configurações.
- **Onde estou (tela inicial):** a posição vem do GPS, de um bairro escolhido na lista ou de um toque no mapa (e fica salva no navegador). A tela mostra o bairro mais próximo, o **nível de risco**, a orientação e a chuva simulada. Se a pessoa está a mais de 8 km de qualquer bairro monitorado, a tela avisa que ela está fora das áreas monitoradas. Em risco **alto** aparece o botão "Sair desta área"; em risco **moderado**, "Ver rota de fuga"; em risco baixo, só o status.
- **Rota de fuga:** acessível a qualquer momento pelo botão fixo "Preciso sair agora" (também por teclado) ou pela sidebar. Mostra o destino recomendado, a distância e a direção (norte, sul etc.), a rota em linha reta no mapa próprio, destinos alternativos (escolha pela lista ou tocando no marcador) e os telefones 199, 193 e 192 com `tel:`. Regra de prioridade: **bairros sem risco (nível baixo) vêm antes dos locais cobertos**; sem nenhum bairro sem risco até 40 km, o local coberto mais próximo vira o destino principal e a tela explica isso. Nenhum bairro de risco alto ou moderado é sugerido como destino.
- **Locais cobertos (fictícios):** lista `LOCAIS_COBERTOS` em `js/main.js` (13 abrigos, escolas, ginásios e centros comunitários inventados, com endereço e capacidade inventados). São uma sugestão para a demonstração e devem ser revisados ou substituídos pelo grupo.
- **Mapa inteligente:** mapa próprio com **áreas coloridas por nível de risco**, marcadores de bairros e de relatos (cor da gravidade), camadas ligáveis, zoom, arraste e navegação por teclado; alternância para Google Maps e satélite (com o contorno do bairro). Duas listas sob o mapa (riscos por bairro e relatos recentes) centralizam o mapa no item escolhido.
- **Registro comunitário:** tipos de ocorrência, gravidade, bairro, data e horário, descrição e localização (a do bairro, um clique no mapa, ou um ponto informado por link do Google Maps / OpenStreetMap ou por coordenadas). Validação, feedback, listagem, filtros por bairro e tipo, mudança de status e remoção dos relatos próprios. Todo relato é identificado como **comunitário e não verificado**.
- **Alertas personalizados:** seleção de bairro, alerta atual com nível (informativo, atenção, risco elevado), orientações, histórico e notificações dentro do aplicativo. O botão "Simular atualização de chuva" recalcula o risco e gera um novo alerta.
- **Inscrição demonstrativa:** formulário com validação de nome, e-mail, CEP e bairro (mantido da versão anterior).
- **Comunidade e configurações:** estatísticas dos relatos, contatos de emergência (199, 193, 192), nome para a saudação, localização padrão, bairros acompanhados e gerenciamento dos dados locais.
- Acessibilidade: HTML semântico, labels associados, `aria-live`, foco visível, link para pular ao conteúdo, navegação por teclado e respeito a `prefers-reduced-motion`.

### Limitações e o que depende de integrações externas

- A **rota de fuga é demonstrativa e em linha reta**: não considera ruas, alagamentos nem bloqueios (rota por ruas exigiria um serviço externo). O aviso aparece na própria tela. Os **locais cobertos são fictícios**. O destino só é sugerido até 40 km do usuário.
- O GPS depende da permissão do usuário e de o navegador oferecer `navigator.geolocation` (em geral exige `https` ou `localhost`). Sem ele, a seleção manual alimenta o mesmo fluxo.
- Os indicadores de chuva, temperatura e risco são **simulados**. O risco é calculado a partir da chuva simulada (a partir de 40 mm é moderado, a partir de 70 mm é alto).
- Os alertas são **simulados** e aparecem só no aplicativo. **Nenhum SMS, WhatsApp, e-mail ou push é enviado.** Isso exigiria backend e serviços de mensageria.
- Relatos e preferências ficam no LocalStorage do navegador: não são compartilhados entre pessoas nem verificados.
- Dados oficiais em tempo real exigiriam integração com fontes como Cemaden e INMET.
- As coordenadas dos bairros são aproximadas.
- Os mapas e a fonte precisam de internet. Nos modos Google Maps e Satélite (`<iframe>`), só um local aparece por vez; áreas e marcadores de todos os bairros existem no modo "Mapa". Se as imagens do OpenStreetMap não carregarem, as áreas e os marcadores continuam visíveis sobre um fundo liso. Respeite os termos de uso do OpenStreetMap e do Google em uso além de demonstração.

## 9. Como executar localmente

1. Clone o repositório:
   ```bash
   git clone <URL-DO-REPOSITORIO>
   ```
2. Abra a pasta do projeto:
   ```bash
   cd AlertaBairro
   ```
3. Abra o arquivo `index.html` com um clique duplo ou arrastando-o para o navegador. O painel fica em `solucao.html`.
4. Opcional, com o VS Code: instale a extensão **Live Server**, clique com o botão direito em `index.html` e escolha **Open with Live Server**.

Nenhuma instalação de dependências é necessária. É preciso estar online para carregar os mapas.

## 10. Integrantes e RMs

| Nome completo | RM | Curso | GitHub | LinkedIn |
|---|---|---|---|---|
| [Nome do integrante 1] | [RM] | [Curso] | [link] | [link] |
| [Nome do integrante 2] | [RM] | [Curso] | [link] | [link] |
| [Nome do integrante 3] | [RM] | [Curso] | [link] | [link] |
| [Nome do integrante 4] | [RM] | [Curso] | [link] | [link] |

## 11. Divisão de responsabilidades

| Integrante | Responsabilidade |
|---|---|
| [Nome do integrante 1] | [A definir] |
| [Nome do integrante 2] | [A definir] |
| [Nome do integrante 3] | [A definir] |
| [Nome do integrante 4] | [A definir] |

## 12. Link do repositório GitHub

[Inserir o link do repositório]

## 13. Link do vídeo pitch

[Inserir o link do vídeo pitch]

## 14. Referências

- IBGE e Cemaden. *População em Áreas de Risco no Brasil*, 2018: <https://www.ibge.gov.br/apps/populacaoareasderisco/>
- ONU Brasil. ODS 13: <https://brasil.un.org/pt-br/sdgs/13>
- ONU Brasil. ODS 11: <https://brasil.un.org/pt-br/sdgs/11>
- Cemaden: <https://www.gov.br/cemaden>
- Defesa Civil Nacional: <https://www.gov.br/mdr/pt-br/assuntos/protecao-e-defesa-civil>
- INMET: <https://portal.inmet.gov.br>

## 15. Declaração de utilização de IA generativa

Preencha esta seção com informações reais antes da entrega.

| Item | Descrição |
|---|---|
| Ferramentas de IA utilizadas | [Informar as ferramentas] |
| Finalidade da utilização | [Informar a finalidade] |
| Partes do projeto apoiadas por IA | [Informar as partes] |
| Revisão e validação pelos integrantes | [Descrever como o código, os textos e os dados foram revisados e testados] |

## 16. Aviso sobre dados

Os bairros são referências geográficas reais, mas todos os indicadores climáticos, níveis de risco, alertas, **locais cobertos e rotas de fuga** são fictícios ou demonstrativos. Os relatos iniciais marcados como "Relato demonstrativo" são inventados; os relatos que você registra ficam apenas no seu navegador e são sempre não verificados.
