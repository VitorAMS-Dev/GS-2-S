# AlertaBairro

Plataforma comunitária de monitoramento climático e comunicação preventiva, desenvolvida para a **Global Solution FIAP 2026/2 (CitizenTech)**.

> **Aviso:** os indicadores de chuva, temperatura e risco exibidos no site são **simulados**, apenas para fins acadêmicos. Não são medições reais nem alertas oficiais. Em caso de risco, siga as orientações da Defesa Civil (telefone 199).

## 1. Descrição

O AlertaBairro é uma plataforma comunitária de monitoramento climático e prevenção de desastres. O site institucional apresenta o projeto e o **painel** (`solucao.html`) funciona como um aplicativo: sidebar, mapa interativo com visão de satélite, registro comunitário de ocorrências, alertas personalizados simulados e configurações. Tudo roda no navegador, sem backend.

## 2. Problema identificado

Moradores de áreas vulneráveis enfrentam enchentes, alagamentos urbanos e deslizamentos, e muitas vezes têm pouco acesso a informações preventivas claras sobre o risco do próprio bairro.

Dado de contexto: cerca de **8,2 milhões de pessoas** viviam em áreas de risco de deslizamentos, inundações e enxurradas nos municípios monitorados pelo Cemaden (estimativa baseada no Censo 2010). Fonte: IBGE e Cemaden, *População em Áreas de Risco no Brasil*, 2018: <https://www.ibge.gov.br/apps/populacaoareasderisco/>.

## 3. Proposta de solução

1. Consulta de indicadores climáticos por bairro.
2. Visualização de níveis de risco (baixo, moderado, alto).
3. Identificação de áreas que exigem atenção, com filtros.
4. Cadastro para receber alertas (demonstrativo).
5. Incentivo à prevenção e à colaboração comunitária.

## 4. Objetivo do projeto

Construir um site funcional, responsivo e acessível que demonstre como a tecnologia pode apoiar a prevenção de desastres ambientais, a conscientização comunitária e a proteção de vidas.

## 5. Relação com os ODS

- **ODS 13, Ação contra a Mudança Global do Clima:** adaptação climática, prevenção de desastres, acesso à informação e conscientização.
- **ODS 11, Cidades e Comunidades Sustentáveis:** resiliência urbana, comunidades mais seguras e redução da vulnerabilidade.

## 6. Tecnologias utilizadas

- HTML5 semântico
- CSS3 (Flexbox, Grid, Media Queries, Custom Properties)
- JavaScript Vanilla (manipulação do DOM, navegação por hash)
- LocalStorage (relatos, alertas, preferências e inscrições)
- [Leaflet 1.9.4](https://leafletjs.com) (biblioteca de mapas, incluída localmente em `lib/leaflet/`)
- Mapa padrão: OpenStreetMap. Satélite: imagens Esri World Imagery (exigem internet)
- Fonte Manrope via Google Fonts, com fallback para fontes do sistema

Sem frameworks, CSS inline ou JavaScript inline. Leaflet é a única biblioteca, adotada porque a reformulação pediu um mapa interativo.

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
│   ├── main.js       (dados, utilitários e validações compartilhados; menu do site)
│   └── app.js        (painel: mapa, relatos, alertas, configurações)
└── lib/
    └── leaflet/      (leaflet.js, leaflet.css, images/)
```

## 8. Funcionalidades

- **Painel (solucao.html):** sidebar (vira menu lateral no celular, com barra de abas inferior), header com busca de bairros, seleção de localização por cidade, notificações, perfil e ação rápida. Navegação por hash: visão geral, monitoramento, mapa, ocorrências, alertas, comunidade e configurações.
- **Visão geral:** saudação, indicadores calculados dos dados (bairros, risco alto, chuva e temperatura médias), mapa, bairros em atenção, alertas recentes, últimas ocorrências e orientações.
- **Mapa inteligente:** Leaflet com alternância entre mapa padrão e satélite, áreas coloridas por nível de risco, marcadores, popups com detalhes, camadas ligáveis, legenda e zoom. Alto risco tem marcador pulsante.
- **Registro comunitário:** tipos de ocorrência, gravidade, bairro, data e horário, descrição e localização (do bairro ou marcada no mapa). Validação, feedback, listagem, filtros por bairro e tipo, mudança de status e remoção dos relatos próprios. Todo relato é identificado como **comunitário e não verificado**.
- **Alertas personalizados:** seleção de bairro, alerta atual com nível (informativo, atenção, risco elevado), orientações, histórico e notificações dentro do aplicativo. O botão "Simular atualização de chuva" recalcula o risco e gera um novo alerta.
- **Inscrição demonstrativa:** formulário com validação de nome, e-mail, CEP e bairro (mantido da versão anterior).
- **Comunidade e configurações:** estatísticas dos relatos, contatos de emergência (199, 193, 192), nome para a saudação, localização padrão, bairros acompanhados e gerenciamento dos dados locais.
- Acessibilidade: HTML semântico, labels associados, `aria-live`, foco visível, link para pular ao conteúdo, navegação por teclado e respeito a `prefers-reduced-motion`.

### Limitações e o que depende de integrações externas

- Os indicadores de chuva, temperatura e risco são **simulados**. O risco é calculado a partir da chuva simulada (a partir de 40 mm é moderado, a partir de 70 mm é alto).
- Os alertas são **simulados** e aparecem só no aplicativo. **Nenhum SMS, WhatsApp, e-mail ou push é enviado.** Isso exigiria backend e serviços de mensageria.
- Relatos e preferências ficam no LocalStorage do navegador: não são compartilhados entre pessoas nem verificados.
- Dados oficiais em tempo real exigiriam integração com fontes como Cemaden e INMET.
- As coordenadas dos bairros são aproximadas.
- Os mapas (padrão e satélite) e a fonte precisam de internet. Respeite os termos de uso do OpenStreetMap e da Esri em uso além de demonstração.

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

Os bairros são referências geográficas reais, mas todos os indicadores climáticos, níveis de risco e alertas são fictícios. Os relatos iniciais marcados como "Relato demonstrativo" são inventados; os relatos que você registra ficam apenas no seu navegador e são sempre não verificados.
