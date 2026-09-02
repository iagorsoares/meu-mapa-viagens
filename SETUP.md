# Guia completo — do zero ao app publicado, sem instalar nada

Este guia parte do princípio de que você já tem os arquivos do projeto (pasta `meu-mapa-viagens/`).
Leia `README.md` primeiro pra entender a estrutura. Siga as partes em ordem.

Tudo aqui é feito pelo navegador — sem Node.js, sem VS Code, sem terminal.

---

## 0. O que você vai precisar

- Uma conta Google (pra você e uma pra sua esposa — pode ser a de vocês normal do Gmail)
- Uma conta no GitHub (gratuita) — é onde o código do app vai ficar
- Um navegador (Chrome, Safari, o que for)

S� isso. Nada pra baixar ou instalar no computador. Nenhuma dessas ferramentas é paga pro uso que vocês vão fazer (ver seção 11).

---

## 1. Firebase — criar o projeto

1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. **Adicionar projeto** → dê um nome (ex: `nosso-mapa-viagens`) → **Continuar**.
3. Na tela do Google Analytics, pode **desativar** (não precisamos dele) → **Criar projeto**.
4. Aguarde a criação e clique em **Continuar**.

Você cai no painel do projeto. É aqui que tudo vai acontecer.

### 1.1 Registrar o app Web

1. Na tela inicial do projeto, clique no ícone **`</>`** ("Web") pra adicionar um app.
2. Dê um apelido (ex: `nosso-mapa-web`). Pode deixar "Configurar também o Firebase Hosting" **desmarcado** — vamos publicar no GitHub Pages (seção 8), não pelo Firebase.
3. Clique **Registrar app**.
4. Você vai ver um bloco de código com `const firebaseConfig = { apiKey: "...", ... }`. **Copie esse objeto inteiro** (ou tire um print — vamos usar na seção 6).
5. Clique **Continuar no console** (não precisa seguir os outros passos que ele sugere ali).

---

## 2. Firebase — Authentication (login Google)

1. No menu lateral: **Build → Authentication → Vamos começar (Get started)**.
2. Na aba **Sign-in method**, clique em **Google** na lista de provedores.
3. Ative o botão **Enable/Ativar**.
4. Escolha um **e-mail de suporte do projeto** (pode ser o seu Gmail).
5. **Salvar**.

Isso já habilita login com Google. O domínio `localhost` já vem autorizado por padrão — o domínio do GitHub Pages você adiciona na seção 9, depois de publicar (só aí você sabe a URL final).

---

## 3. Firebase — Firestore Database

1. Menu lateral: **Build → Firestore Database → Criar banco de dados (Create database)**.
2. Escolha a localização do servidor: selecione **`nam5 (United States)`**. Algumas regiões (como São Paulo) às vezes pedem upgrade de plano mesmo no free tier — `nam5` é a que funciona garantido sem pedir cartão.
3. Modo de início: escolha **Produção (Production mode)** — vamos colocar regras customizadas no próximo passo, então não tem problema começar travado.
4. **Criar**.

### 3.1 Configurar as regras de segurança

1. Ainda em Firestore Database, clique na aba **Regras (Rules)**.
2. Apague o conteúdo padrão e cole o conteúdo do arquivo **`firestore.rules`** do projeto — a regra padrão exige apenas login com alguma conta Google (mesmo padrão do Garfinho).
3. Clique **Publicar (Publish)**.

Quem protege o banco aqui é o login exigido, não a URL do app ser secreta — o `firebaseConfig` sempre é público, vai no código que roda no navegador de qualquer um que abrir a página. A regra padrão já barra acesso anônimo e bots.

Se um dia quiser travar o acesso só às contas de vocês dois, o próprio arquivo `firestore.rules` já traz essa versão pronta, comentada no final — é só trocar os blocos e os e-mails direto pelo editor do GitHub (seção 6 explica como editar sem instalar nada).

---

## 4. Cloudinary — conta e upload das fotos

1. Acesse **cloudinary.com** → **Sign up free**. Pode entrar com Google direto.
2. No **Dashboard**, logo no topo, tem o campo **Cloud name** — copie esse valor.
3. Agora crie um "upload preset" (permite o app enviar fotos direto do navegador, sem servidor próprio):
   - Clique na engrenagem **Settings** → aba **Upload**.
   - Em **Upload presets**, clique **Add upload preset**.
   - **Signing Mode: Unsigned** (importante — é o que permite o upload direto do celular).
   - Em **Folder**, pode deixar em branco (o app já define a pasta `nosso-mapa-viagens` sozinho).
   - **Save**.
   - Copie o **nome do preset** gerado (aparece na lista, algo como `abcd1234`, ou renomeie pra algo memorável antes de salvar).

Guarde o **Cloud name** e o **nome do preset** — vão para a seção 6.

> ℹ️ Plano gratuito do Cloudinary: 25 créditos/mês (1 crédito = 1 GB de armazenamento OU 1 GB de tráfego OU 1.000 transformações), sem precisar de cartão de crédito. Como o app já comprime as fotos antes de enviar (~200-400 KB cada), isso dá pra milhares de fotos de prefeitura. Mais detalhes na seção 11.

---

## 5. Cloudinary — CORS (importante, não pule)

Por padrão o Cloudinary aceita upload de qualquer origem quando o preset é *unsigned*, então normalmente não precisa configurar nada extra aqui. Se em algum teste o upload falhar com erro de CORS no console do navegador, volte em **Settings → Upload → Upload presets**, edite o preset e confira se **Unsigned** está mesmo ativo.

---

## 6. Configurar o projeto com suas chaves (sem editor de código)

Dois arquivos precisam das suas chaves: `js/firebase-config.js` e `js/cloudinary-config.js`. Como você não tem um editor instalado, o jeito mais simples é:

**Cole aqui na nossa conversa** o `firebaseConfig` da seção 1.1 e o Cloud name + preset da seção 4 — eu já deixo os dois arquivos prontos, com as chaves certas, pra você só arrastar pro GitHub na seção 8.

Se um dia quiser editar você mesmo (trocar alguma chave, sem precisar voltar aqui), dá pra fazer 100% pelo navegador, sem instalar nada:
1. Abra o repositório no GitHub e clique no arquivo que quer mudar.
2. Clique no ícone de lápis (✏️, **Edit this file**) no canto superior direito.
3. Altere o texto direto na página.
4. Role até o final e clique **Commit changes**.

Pra edições maiores, o GitHub também tem uma versão do VS Code que roda **inteira no navegador**, sem instalar nada: com o repositório aberto, aperte a tecla **`.`** (ponto) do teclado.

> A `apiKey` do Firebase **não precisa ficar secreta** — ela só identifica o projeto; quem protege os dados de verdade são as regras do Firestore que você configurou na seção 3.1.

---

## 7. Testar o app

Sem servidor local instalado, o teste é feito direto na versão publicada: depois de subir os arquivos pro GitHub e ativar o GitHub Pages (seção 8), abra a URL gerada nele.

Teste o login primeiro (**Entrar com Google**), depois registrar uma cidade: **Brasil → seu estado → um município → tire/escolha uma foto**. Se a foto aparecer no card depois de salvar, o Cloudinary está configurado certo.

Se algo não funcionar, me conta o que apareceu na tela (ou manda um print) — eu ajusto os arquivos e você só precisa repetir o upload da seção 8 com os arquivos corrigidos.

---

## 8. Publicar no GitHub Pages — sem instalar nada

1. Acesse **github.com**, crie uma conta se ainda não tiver, e clique em **New repository** (o **+** no canto superior direito → **New repository**).
2. Dê um nome (ex: `meu-mapa-viagens`). Pode deixar **Public** — os dados de vocês continuam protegidos pelas regras do Firestore (seção 3.1); publicar o código não expõe fotos nem cidades, só quem faz login vê algum dado. **Create repository**.
3. Na tela do repositório vazio, clique no link **uploading an existing file**.
4. Arraste a **pasta inteira do projeto** (a pasta `meu-mapa-viagens` descompactada, com `index.html`, `css/`, `js/`, `data/` etc. dentro) pra área de upload do navegador. O GitHub reconhece e recria a estrutura de pastas sozinho.
5. Escreva uma mensagem (ex: "primeira versão") e clique **Commit changes**.
6. Crie um arquivo `.nojekyll` vazio na raiz do repositório (**Add file → Create new file**, nome `.nojekyll`, sem conteúdo, **Commit changes**) — isso evita que o GitHub tente processar o site com Jekyll, o que quebra o build num projeto HTML puro como este.
7. Vá em **Settings → Pages** (menu lateral do repositório).
8. Em **Source**, escolha **Deploy from a branch**.
9. Em **Branch**, escolha **main** e a pasta **/ (root)** → **Save**.
10. Aguarde 1-2 minutos, atualize a página — vai aparecer a URL publicada, algo como:
   ```
   https://seu-usuario.github.io/meu-mapa-viagens/
   ```

> **Pra atualizar depois**: repita **Add file → Upload files** com os arquivos novos/alterados — eles substituem os antigos automaticamente. Pra trocar só um arquivo pequeno, é mais rápido editar direto pelo navegador (seção 6).

---

## 9. Autorizar o domínio do GitHub Pages no Firebase

Sem este passo o login com Google **vai falhar** na URL publicada (mesmo já funcionando ali dentro do próprio GitHub enquanto edita).

1. Volte no **Firebase Console → Authentication → Settings → Authorized domains**.
2. **Add domain** → cole exatamente o domínio (sem `https://` e sem a barra final), ex:
   ```
   seu-usuario.github.io
   ```
3. **Add**.

---

## 10. Instalar como app no celular (PWA)

**No seu celular e no da sua esposa**, separadamente:

1. Abra a URL do GitHub Pages no navegador (Chrome no Android, Safari no iOS).
2. Faça login com a conta Google de cada um.
3. Android (Chrome): toque no menu **⋮ → Instalar app** (ou vai aparecer um banner automático).
   iPhone (Safari): toque no ícone de compartilhar **⬆️ → Adicionar à Tela de Início**.
4. Pronto — ícone na tela inicial, abre em tela cheia como um app nativo.

Como os dados ficam no mesmo Firestore compartilhado, o que um registra aparece pro outro em tempo real (com o app aberto) ou assim que abrir o app de novo.

---

## 11. Isso vai custar alguma coisa?

Pra 2 pessoas registrando cidades de viagens de fim de semana, não — e nenhum dos serviços abaixo pede cartão de crédito pra esse uso. Os números do plano gratuito (2026):

| Serviço | Free tier | Uso esperado de vocês |
|---|---|---|
| Firestore | 50 mil leituras/dia, 20 mil escritas/dia, 1 GB armazenado | Poucas dezenas de leituras/escritas por sessão de uso — nem chega perto |
| Firebase Auth (Google) | Ilimitado | — |
| GitHub Pages | Gratuito para repositórios públicos | O app inteiro (código + dados geográficos) tem ~2,7 MB |
| Cloudinary | 25 créditos/mês (≈25 GB entre armazenamento e tráfego, ou 25 mil transformações), sem cartão | Fotos comprimidas ficam ~200-400 KB cada — cabem milhares |

Se um dia isso crescer muito (pouco provável pro uso descrito), o Firebase tem um plano "Blaze" pay-as-you-go que só cobra o que passar da cota gratuita — mas aí sim exigiria vincular cartão.

---

## 12. Problemas comuns

**"Erro ao enviar foto" / falha no upload**
→ Confira se `CLOUDINARY_CLOUD_NAME` e `CLOUDINARY_UPLOAD_PRESET` em `js/cloudinary-config.js` estão exatamente como no painel do Cloudinary, e se o preset está mesmo como **Unsigned**.

**Login com Google não funciona na URL publicada, mas parece certo**
→ Volte na seção 9: o domínio do GitHub Pages precisa estar em Authentication → Authorized domains, escrito exatamente igual (sem `https://`, sem barra no final).

**Build falha no GitHub Actions com menção a "Jekyll" nos logs**
→ Falta o arquivo `.nojekyll` na raiz do repositório (veja seção 8, passo 6) — sem ele, o GitHub tenta processar o site como um projeto Jekyll e quebra.

**"Missing or insufficient permissions" no console do navegador**
→ As regras do Firestore (seção 3.1) ainda não foram publicadas, ou o login não completou.

**Município ou país não aparece / mapa em branco**
→ Confere se a pasta `data/` inteira (com as subpastas de dentro) foi mesmo enviada no upload da seção 8 — é fácil esquecer alguma subpasta ao arrastar.

**Página fica só com um texto estranho tipo `{"error"...}` ao abrir a URL**
→ O GitHub Pages ainda não terminou de publicar (aguarde mais um pouco) ou a pasta escolhida em Settings → Pages não é a raiz (`/ root`) do repositório.

**Depois de tirar uma foto pelo celular ela vem gigante/lenta**
→ Já é esperado o upload demorar alguns segundos em 4G, mas o arquivo enviado é comprimido primeiro (máx. 1600px, ~80% de qualidade) — se estiver muito lento, pode ser a conexão do momento, não o app.

---

## 13. Ideias pra evoluir depois

Combinado que ficam fora do MVP, mas o modelo de dados já foi pensado pra não travar isso no futuro:

- **Roteiro de viagem futura**: comparar uma rota (via OSRM ou Google Directions) com as cidades já visitadas no caminho, pra sugerir paradas novas.
- **Editar/arrastar a posição do pino** de uma cidade do Mundo, caso o toque no mapa não fique exatamente em cima do lugar certo.
- **Atualizar a contagem de municípios** se o IBGE criar algum novo (raro) — pode me pedir pra regenerar os dados quando precisar.
