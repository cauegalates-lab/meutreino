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

## Ativar o Firebase

1. No Firebase Console, crie/abra o projeto e registre um **App Web**.
2. Copie o objeto `firebaseConfig` fornecido pelo console para `firebase-config.js`.
3. Em **Authentication > Sign-in method**, habilite **Google**.
4. Crie o **Cloud Firestore**.
5. Publique as regras seguras que já estão em `firestore.rules`.
6. Publique o site. Se usar um domínio fora do Firebase Hosting, adicione esse domínio aos domínios autorizados do Authentication.

Para publicar tudo pelo Firebase Hosting, dentro desta pasta:

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy
```

O login Google usa o mesmo fluxo em computador e celular (`signInWithPopup`),
sem redirecionamento específico para mobile. Em hospedagens externas, mantenha
o domínio publicado na lista de domínios autorizados do Firebase Authentication.

Estrutura de dados usada no Firestore:

- `users/{uid}/app/settings`: perfil e treinos personalizados.
- `users/{uid}/workouts/{treinoId}`: cada treino concluído em um documento separado.

As regras permitem leitura e escrita somente quando o usuário autenticado possui o mesmo `uid`. O app continua usando armazenamento local durante a falta de sinal e envia as alterações ao Firebase quando a conexão volta.

Desde a versão 11, o armazenamento local também é separado por `uid`. Ao atualizar,
a rotina e os dados locais da versão anterior são migrados apenas para a conta
que já era dona daquele navegador. Uma conta nova recebe somente a rotina inicial
como ponto de partida. Perfil, cargas, treinos personalizados e histórico continuam
privados e separados por conta.
