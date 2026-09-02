# 🗺️ Nosso Mapa — Registro de Viagens

App pessoal (PWA) para registrar cidades e países visitados, com fotos e roteiros.
HTML/CSS/JS puro (sem build/framework), dados no Firebase Firestore, fotos no Cloudinary, publicado no GitHub Pages — tudo pelo navegador, sem instalar nada.

## Como rodar

Este projeto **não funciona abrindo o `index.html` direto no navegador** — ele precisa:

1. Das suas credenciais do Firebase em `js/firebase-config.js`
2. Das suas credenciais do Cloudinary em `js/cloudinary-config.js`
3. De ser servido via HTTP (não `file://`), por causa dos módulos ES e do Service Worker

**Siga o `SETUP.md`** — passo a passo completo, do zero até publicado, tudo pelo navegador (sem Node.js, sem VS Code, sem terminal).

## Estrutura

```
index.html               tela única, todas as abas
css/style.css            estilos (azul = interface, verde = progresso/mapa)
js/firebase-config.js    ⚠️ preencha com suas chaves
js/cloudinary-config.js  ⚠️ preencha com suas chaves
js/db.js                 acesso ao Firestore (CRUD + tempo real)
js/upload.js             compressão + upload de fotos
js/app.js                autenticação, navegação, estado global
js/ui-*.js               lógica de cada aba (dashboard/brasil/mundo/viagens)
js/util.js                funções pequenas reutilizadas
data/estados-br.json               27 estados (simplificado)
data/municipios/{uf}.json          municípios por estado, carregado sob demanda
data/paises-mundo.json             258 países/territórios com código ISO
data/contagem-municipios-uf.json   total de municípios por estado
firestore.rules          regras de segurança (exige login Google; versão restrita por e-mail vem comentada)
manifest.json / service-worker.js  PWA (instalável, funciona offline)
```

## Fonte dos dados geográficos

- Municípios: [tbrugz/geodata-br](https://github.com/tbrugz/geodata-br) (simplificado com mapshaper)
- Países: [datasets/geo-countries](https://github.com/datasets/geo-countries) (simplificado com mapshaper)

Esses dados mudam raramente (só quando o IBGE cria um município novo, por exemplo), então não há
necessidade de atualização frequente — mas se notar algo faltando, dá pra regenerar com o mapshaper.

## Publicação

Publicado no GitHub Pages via upload direto pelo navegador (arrastar a pasta na tela de upload
do GitHub) — não precisa de git, terminal, Node.js ou editor de código instalado. Veja a seção 8
do `SETUP.md`. Edições futuras também dá pra fazer 100% pelo navegador, direto no site do GitHub.
