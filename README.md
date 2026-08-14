# Meu Treino

App web mobile para registrar treinos, cargas, séries, repetições, frequência e evolução.

## Como abrir

- Para visualizar localmente, rode a pasta por um servidor web (por exemplo, `npx serve .`).
- Para usar como PWA instalável e ativar login e salvamento na nuvem, publique em HTTPS.

## O que já funciona

- Treino do dia e rotina semanal.
- Rotina inicial pronta com seis dias de treino; cada conta pode substituir um dia por seu próprio treino.
- Criação e exclusão de treinos personalizados, com dia, grupo, duração, exercícios, séries, repetições, carga e descanso.
- Registro de carga e repetições por série.
- Ajuste rápido de carga em passos de 2,5 kg.
- Carga definida pelo usuário, com o último treino mantido apenas como referência histórica.
- Marcação de séries concluídas e descanso automático conforme o exercício, com `+30s`, pular e vibração ao finalizar em aparelhos compatíveis.
- Inclusão de séries extras.
- Anotações por exercício durante o treino.
- Cronômetro do treino.
- Tela de execução compacta: imagem demonstrativa do exercício atual, séries abertas e os demais exercícios em uma lista curta para alternar com um toque.
- Biblioteca com 29 imagens próprias em formato WebP, mostrando em vermelho os músculos trabalhados; o agachamento usa ângulo frontal/¾ e figurino padronizado.
- Histórico salvo imediatamente no próprio aparelho, separado por conta, inclusive sem internet.
- Integração preparada com Firebase Authentication + Cloud Firestore.
- Login com Google e salvamento automático no Firebase, separado pelo identificador exclusivo de cada usuário.
- Tela de instalação inteligente no primeiro acesso: botão nativo no Android e orientação curta no iPhone.
- Área individual por `uid`: perfil, foto, rotina, histórico, cargas e configurações nunca usam os dados locais de outra conta.
- Progressão real de carga, volume e repetições, sem misturar dados fictícios às métricas do usuário.
- Histórico individual por exercício, gráfico, recordes, volume mensal, sequência e consistência.
- Perfil físico editável com peso, altura, objetivo, foto e dias de treino.
- Configurações de descanso automático, tempo padrão e vibração.
- A conta Google apenas identifica o usuário; treinos, perfil e configurações são armazenados no Firestore, sem exportação manual.
- Interface responsiva e instalável como PWA.
- Tela de abertura curta ao iniciar pelo ícone da tela inicial, com transição para a sessão do usuário.
- Login Google minimalista e cards com cores sólidas.
- Rolagem mobile por toque sem barras artificiais e sem barra falsa de status do celular.
- Plano único **Meu Treino Pro**, com controle de acesso individual por conta.
- Área **Financeiro** dentro de Meu Perfil, com 12 parcelas mensais de R$ 29,99, vencimentos, status e espaço individual para QR Code Pix.
- Central administrativa separada em `/admin/`, com usuários online/offline, busca, filtros, ativação, pausa, cancelamento, renovação, exclusão e controle manual das parcelas.

## Adicionar vídeos depois

Cada exercício já possui os campos `poster` e `videoUrl` no objeto `EXERCISE_MEDIA`, em `app.js`. Para trocar a imagem estática por um vídeo sem refazer a tela, coloque o arquivo dentro do projeto e preencha apenas `videoUrl`; o player com controles aparecerá automaticamente e continuará usando a imagem como capa.

## Ativar o Firebase e a central administrativa

1. No Firebase Console, crie/abra o projeto e registre um **App Web**.
2. Copie o objeto `firebaseConfig` fornecido pelo console para `firebase-config.js`.
3. Em **Authentication > Sign-in method**, habilite **Google**.
4. Crie o **Cloud Firestore**.
5. Mude o projeto Firebase para o plano que permite publicar Cloud Functions.
6. Publique as regras e as Functions protegidas que já estão no projeto.
7. Publique o site. Se usar um domínio fora do Firebase Hosting, adicione esse domínio aos domínios autorizados do Authentication.

Na primeira publicação das Functions, instale as dependências e informe o e-mail da conta que será a administradora quando o Firebase solicitar `ADMIN_EMAIL`:

```bash
npx firebase-tools login
npx firebase-tools use treino-346bb
cd functions
npm install
cd ..
npx firebase-tools deploy --only firestore:rules,functions
```

Depois, acesse `/admin/` no mesmo domínio do app e entre com exatamente esse e-mail. Todos os novos logins aparecem como **Aguardando** até que o administrador ative o acesso. A ativação cria o parcelamento mensal do plano único **Meu Treino Pro**: 12 parcelas de R$ 29,99.

Se também usar Firebase Hosting, publique o front-end com:

```bash
npx firebase-tools deploy --only hosting
```

Se o front-end estiver na Vercel, continue publicando pela Vercel e use o Firebase apenas para Authentication, Firestore e Functions. Nesse caso, mantenha o domínio da Vercel autorizado no Firebase Authentication.

As coleções não precisam ser criadas vazias no console. Elas surgem automaticamente nestes momentos:

- `presence`: no primeiro login de cada conta.
- `admins`: na primeira entrada do e-mail administrador em `/admin/`.
- `access`: no primeiro login, já com a situação **Aguardando**; depois é atualizado pela central.
- `users`: quando um usuário já ativo salva os próprios dados.
- `adminNotes` e `adminAudit`: ao executar ações na central.

### Proteção adicional com App Check

O código já aceita App Check com reCAPTCHA Enterprise. Para ativá-lo com segurança:

1. No Google Cloud, crie uma chave reCAPTCHA Enterprise do tipo Web e cadastre todos os domínios publicados.
2. Em **Firebase Console > App Check**, registre o App Web usando a mesma chave.
3. Cole somente a chave pública em `appCheckSiteKey`, no arquivo `firebase-config.js`.
4. Publique o front-end e monitore as métricas do App Check.
5. Só depois habilite a obrigatoriedade para Firestore, Authentication e Functions, evitando bloquear usuários válidos durante a transição.

O login Google usa o mesmo fluxo em computador e celular (`signInWithPopup`),
sem redirecionamento específico para mobile. Em hospedagens externas, mantenha
o domínio publicado na lista de domínios autorizados do Firebase Authentication.

Estrutura de dados usada no Firestore:

- `users/{uid}/app/settings`: perfil e treinos personalizados.
- `users/{uid}/workouts/{treinoId}`: cada treino concluído em um documento separado.
- `access/{uid}`: situação do acesso, vencimento e as 12 parcelas do próprio usuário.
- `presence/{uid}`: último sinal de atividade usado para indicar online/offline na central.
- `admins/{uid}` e `adminAudit`: permissão administrativa e registro das ações sensíveis.
- `adminNotes/{uid}`: observações internas, invisíveis para o usuário comum.

As regras permitem que cada usuário leia somente o próprio acesso e use os dados de treino apenas quando a assinatura está ativa e dentro do vencimento. Alterações administrativas passam por Cloud Functions; o navegador nunca recebe credenciais administrativas. O app continua usando armazenamento local durante a falta de sinal e envia as alterações ao Firebase quando a conexão volta.

## QR Code Pix

Cada parcela já possui campos próprios para `pixCode` e `qrCodeUrl`, mas eles começam vazios de propósito. Assim, o app não mostra um QR que pareça cobrar sem existir uma transação real. Quando a conta de recebimento ou o provedor Pix for escolhido, a Function de cobrança poderá preencher esses campos e um webhook poderá confirmar a parcela automaticamente. Até lá, o administrador pode marcar uma parcela como paga ou reabri-la manualmente.

Desde a versão 11, o armazenamento local também é separado por `uid`. Ao atualizar,
a rotina e os dados locais da versão anterior são migrados apenas para a conta
que já era dona daquele navegador. Uma conta nova recebe somente a rotina inicial
como ponto de partida. Perfil, cargas, treinos personalizados e histórico continuam
privados e separados por conta.
