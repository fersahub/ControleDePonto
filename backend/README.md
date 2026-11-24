# Backend Google Sheets — ControleDePonto

Este diretório contém o backend Apps Script do ControleDePonto. Ele reaproveita a planilha central existente e adiciona autenticação individual, sessões e permissões por usuário.

## O que esta versão implementa

- Conta de administrador e contas de funcionários vinculadas a matrícula.
- Login por usuário e senha; senhas armazenadas como HMAC-SHA256 com salt individual e segredo privado do Apps Script.
- Senha temporária obrigatoriamente trocada no primeiro acesso.
- Sessões com validade de 14 dias, revogação ao sair, redefinir senha ou desativar uma conta.
- Autorização no servidor para leitura, criação, alteração e exclusão.
- Funcionário consulta e modifica apenas registros, jornadas e escalas vinculados ao próprio usuário.
- Administrador consulta a base geral, cria/desativa contas, redefine senhas e importa backups.
- Dados antigos sem proprietário permanecem visíveis ao administrador; ao criar uma conta, dados legados da matrícula são vinculados ao funcionário correspondente.
- A planilha continua privada no Google Drive. A URL do Apps Script é pública, mas não concede acesso aos dados sem sessão válida.

## Atualizar o Apps Script existente

**Não crie um novo projeto nem uma nova planilha.** Use o mesmo projeto Apps Script que já está conectado à planilha atual para preservar o ID guardado nas propriedades do script.

1. Abra o projeto existente em [script.google.com](https://script.google.com).
2. Substitua todo o conteúdo de Code.gs pelo arquivo atualizado deste repositório: [backend/apps-script/Code.gs](https://github.com/fersahub/ControleDePonto/blob/main/backend/apps-script/Code.gs).
3. Confira se o manifesto appsscript.json continua com:
   - timeZone: America/Bahia
   - access: ANYONE_ANONYMOUS
   - executeAs: USER_DEPLOYING
4. Salve o projeto.
5. Execute setupControleDePonto() e autorize as permissões solicitadas. O script reaproveita a planilha existente e cria as abas USUARIOS e SESSOES, sem apagar LANCAMENTOS, JORNADAS ou ESCALAS.
6. No Registro de execução, copie a senha temporária inicial do administrador, caso ela tenha sido gerada nessa execução. O usuário inicial é admin. Se o primeiro resultado não tiver sido guardado, execute resetControleDePontoAdminPassword() e copie a nova senha temporária. Essa função encerra sessões administrativas anteriores.
7. Acesse **Implantar → Gerenciar implantações**, edite a implantação atual, selecione **Nova versão** e clique em **Implantar**. Mantenha **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.
8. Copie a URL do aplicativo da Web que termina em /exec. Esse endereço é público e será configurado uma única vez no arquivo assets/js/backend-config.js do site. Não é uma chave secreta.

## Publicar a URL central para todos os navegadores

No arquivo assets/js/backend-config.js, substitua o valor vazio de apiUrl pela URL de implantação que termina em /exec. Faça essa alteração uma única vez no repositório e publique pelo GitHub Actions. Depois disso, todos os computadores usarão automaticamente o mesmo backend; funcionários não precisam configurar endereço ou chave.

## Criar as contas dos funcionários

1. Entre no site com usuário admin e a senha temporária.
2. Altere a senha quando solicitado.
3. Na área **Administração do banco central**, informe nome completo, matrícula e nome de usuário para cada funcionário.
4. O sistema gera uma senha temporária; entregue-a diretamente ao funcionário por canal privado.
5. No primeiro acesso, o funcionário deverá definir uma senha própria.

A matrícula precisa ser única entre as contas de funcionários. O administrador não deve compartilhar sua senha com os funcionários.

## Dados existentes e backups

- As abas antigas permanecem na mesma planilha.
- Dados antigos sem proprietário continuam visíveis ao administrador.
- Ao cadastrar um funcionário, os registros legados da matrícula informada que não tinham dono — ou estavam atribuídos ao perfil administrador — são vinculados à nova conta.
- O administrador pode importar backups locais de outros computadores. A importação deduplica lançamentos e associa registros à conta criada para a matrícula correspondente.
- A operação de importação acrescenta e mescla; não limpa a planilha.
- A cópia local de cada conta é separada no navegador por identificador de usuário.

## Comunicação e limites

O backend recebe chamadas via formulário oculto/iframe e responde por postMessage, sem depender de CORS configurável no Content Service. A autenticação e as permissões são verificadas no servidor em toda operação. O código da interface não contém senha administrativa, token compartilhado ou segredo do Apps Script.

Google Apps Script tem cotas e limites de execução que podem mudar: https://developers.google.com/apps-script/guides/services/quotas. Google Sheets é apropriado para operação inicial/moderada, mas não substitui um banco transacional de alta concorrência. Mantenha backups administrativos periódicos e não compartilhe a planilha diretamente com os funcionários.
