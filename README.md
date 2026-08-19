# Meu Treino — versão refatorada v26

Aplicativo de treino com login Google/Firebase, sincronização no Firestore, painel administrativo e controle manual de 12 parcelas.

## Configuração deste projeto

- Firebase Project ID: `treino-346bb`
- Firestore Database ID: `default` **sem parênteses**
- Login: Google via Firebase Authentication
- Plano: Meu Treino Pro
- Parcelamento: **12 parcelas de R$ 29,90**
- Intervalo de vencimento: **30 dias exatos** a partir da data do primeiro pagamento

> Importante: o banco existente deste projeto se chama `default`. Não altere para `(default)` e não crie outro Firestore.

## O que mudou nesta versão

### 1. Validação administrativa corrigida na raiz

A central aceita os dois formatos abaixo, sem exigir duplicação de cadastro:

- `admin/{UID}` com `valor: true` — formato que já existe no seu Firestore;
- `admins/{UID}` com `enabled: true` — formato alternativo/novo.

O erro `Missing or insufficient permissions` acontecia porque a aplicação lia `admin/{UID}`, mas as regras anteriores não tinham uma regra direta para permitir que o próprio UID lesse esse documento. `firestore.rules` agora cobre explicitamente os dois formatos, mantendo escrita bloqueada nos documentos de administrador.

### 2. Regra financeira centralizada

A lógica de parcelamento deixou de ficar espalhada pelo app e pelo painel. O módulo `billing.js` concentra:

- quantidade de parcelas;
- valor da parcela;
- criação e normalização do parcelamento;
- data-base do primeiro pagamento;
- cálculo dos vencimentos;
- alteração de status paga/pendente;
- preservação dos campos de Pix/QR Code.

A pasta `functions/` usa a mesma regra de negócio em um módulo próprio do ambiente Node (`functions/billing.js`), para que eventual uso de Cloud Functions mantenha o mesmo comportamento.

### 3. Vencimentos

Antes do primeiro pagamento, as datas aparecem como **A definir**.

Quando a **parcela 1** é marcada como paga, o sistema registra a data/hora daquele momento como `firstPaymentAt`. A partir dela:

- parcela 1: data do primeiro pagamento;
- parcela 2: +30 dias;
- parcela 3: +60 dias;
- ...;
- parcela 12: +330 dias.

Não é permitido marcar uma parcela posterior como paga antes da parcela 1, porque a parcela 1 define a data-base.

Se a parcela 1 for reaberta, a data-base só pode ser removida se nenhuma parcela posterior continuar marcada como paga.

### 4. Financeiro e QR Code

O card do plano mostra somente:

`12 parcelas de R$ 29,90`

O valor total foi removido. O QR Code/Pix continua independente da lógica dos vencimentos e pode ser configurado posteriormente.

### 5. Interface

A interface foi suavizada para reduzir a sensação de vários cards independentes:

- bordas menos visíveis;
- sombras reduzidas;
- painéis com fundo mais próximo ao fundo da página;
- financeiro integrado à tela inteira;
- parcelas organizadas como lista contínua com divisores discretos;
- mesma direção visual aplicada ao painel administrativo.

### 6. Cache/PWA

O cache foi atualizado para `v26` e o novo `billing.js` foi incluído no service worker. Isso evita que o navegador continue carregando a lógica antiga depois do deploy.

## Arquivos principais

- `firebase-config.js` — projeto Firebase e Database ID `default`.
- `firebase-sync.js` — autenticação e sincronização do aplicativo.
- `billing.js` — regra financeira compartilhada no navegador.
- `app.js` — aplicação e interface do usuário.
- `styles.css` — interface principal.
- `admin/admin.js` — central administrativa.
- `admin/admin.css` — visual da central.
- `firestore.rules` — regras de segurança, incluindo compatibilidade com `admin/{UID}`.
- `service-worker.js` — cache/PWA v26.
- `PASSO_A_PASSO_FINAL.txt` — instruções exatas para publicar e testar.

## Segurança do admin

O documento administrativo continua sem poder ser criado ou alterado pelo próprio site. As regras permitem ao usuário autenticado ler somente o documento administrativo com o próprio UID para validar sua entrada. As operações administrativas sobre `access`, `adminNotes`, `adminAudit` e dados dos usuários continuam condicionadas a `isAdmin()`.

## Publicação

Leia `PASSO_A_PASSO_FINAL.txt` antes de substituir a versão que está no ar.
