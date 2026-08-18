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

## Configuração gratuita do Firebase

Esta versão usa somente **Firebase Authentication + Cloud Firestore** e funciona no plano gratuito Spark. Não há Cloud Functions nem cobrança automática.

1. No Firebase Console, mantenha o projeto no plano **Spark**.
2. Em **Authentication > Sign-in method**, habilite o Google.
3. Em **Authentication > Settings > Authorized domains**, adicione o domínio publicado na Vercel.
4. Em **Firestore Database**, crie o banco em modo de produção.
5. Abra a aba **Rules**, substitua o conteúdo pelo arquivo `firestore.rules` e clique em **Publish**.
6. Publique o site novamente na Vercel.

Também é possível publicar as regras pelo terminal, sem contratar o plano pago:

```bash
npx firebase-tools login
npx firebase-tools use treino-346bb
npx firebase-tools deploy --only firestore:rules
```

## Tornar sua conta administradora

1. Entre uma vez em `/admin/` usando sua conta Google. A tela exibirá seu UID.
2. No Firebase Console, abra **Firestore Database > Data**.
3. Crie a coleção `admins`.
4. Crie um documento cujo ID seja exatamente o UID mostrado na central.
5. Adicione o campo `enabled`, tipo **boolean**, valor `true`.
6. Reabra `/admin/`.

O documento `admins/{uid}` não pode ser criado ou alterado pelo site. Isso evita que um usuário comum se transforme em administrador pelo navegador.

## Como o bloqueio manual funciona

- O primeiro login com Google cria automaticamente `access/{uid}` com `status: "active"`. Portanto, todos entram liberados por enquanto e passam a aparecer na central.
- Quando alguém não pagar, abra `/admin/` e toque em **Bloquear**.
- A central altera o status para `paused`; o app fecha o acesso assim que o aparelho receber a mudança.
- Para devolver o acesso, toque em **Liberar**.
- Não existe vencimento automático. A situação depende somente da sua ação na central.
- Bloquear o app não apaga a conta Google da lista do Firebase Authentication.

Cada usuário pode ler apenas o próprio documento e só pode salvar treinos enquanto seu status estiver `active`. Somente UIDs cadastrados em `admins` podem listar pessoas ou alterar acessos.

## Coleções criadas automaticamente

- `access`: cadastro e status de acesso de cada login.
- `presence`: atividade recente para indicar online/offline.
- `users`: perfil, rotina, configurações e treinos, sempre separados por UID.
- `adminNotes`: observações internas feitas na central.
- `adminAudit`: histórico das ações administrativas.

A coleção `admins` é a única criada manualmente, uma vez, para cadastrar sua conta administrativa.

## Financeiro e QR Code Pix

O controle das 12 parcelas de R$ 29,99 continua manual. A central pode criar as parcelas e marcar cada uma como paga ou pendente. Os campos `pixCode` e `qrCodeUrl` ficam vazios até você definir o recebimento; o Firebase não cobra nem confirma pagamentos sozinho.


### Ajustes de estabilidade desta versão

- Login e cadastro de acesso usam Firestore Lite (REST), evitando a conexão WebChannel que podia retornar `unavailable`.
- O painel administrativo carrega primeiro a lista de acessos e busca presença/observações em segundo plano.
- A central mantém um cache local do último resultado depois de confirmar a conta administradora, deixando reaberturas mais rápidas.
- O App Check só é carregado se uma chave tiver sido configurada.
- Cache do PWA atualizado para a versão 21 para impedir que o navegador continue usando os scripts antigos.

## Observações importantes

- O login Google usa `signInWithPopup` no computador e no celular.
- O domínio da Vercel precisa estar autorizado no Firebase Authentication.
- O app revalida o acesso periodicamente e ao voltar para a tela; um bloqueio normalmente aparece em até 30 segundos enquanto estiver online. Um aparelho offline recebe a mudança ao voltar à internet.
- Para apagar o registro de uma pessoa em **Authentication > Users**, faça isso manualmente no Firebase Console. A central consegue bloquear e remover os dados do Firestore, mas não apagar outra conta do Authentication sem um servidor administrativo.
- O armazenamento local é separado por UID. Perfil, cargas, treinos personalizados e histórico permanecem privados entre contas.
