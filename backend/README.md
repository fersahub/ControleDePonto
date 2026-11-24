# Backend Google Sheets — ControleDePonto

Este diretório contém o backend Google Apps Script que conecta o site ao Google Sheets.

## Escopo desta etapa

- Banco central com as abas `LANCAMENTOS`, `JORNADAS` e `ESCALAS`.
- Consulta e gravação dos dados centrais.
- Sincronização dos novos lançamentos, jornadas e escalas.
- Importação mesclada de backups JSON exportados pelo site.
- Deduplicação por ID e assinatura do lançamento durante a importação.
- Bloqueio de gravações concorrentes por `LockService`.
- Chave API compartilhada guardada em Script Properties; não é publicada no código.
- Nenhum cadastro de usuários, login individual ou separação de dados por pessoa nesta etapa.

## Preparar o projeto Apps Script

1. Crie uma planilha vazia no Google Drive ou deixe que o script crie uma automaticamente.
2. Acesse [script.google.com](https://script.google.com) e crie um projeto independente.
3. Copie o conteúdo de `Code.gs` para o editor.
4. Em **Configurações do projeto**, habilite a exibição do arquivo de manifesto `appsscript.json`; substitua o manifesto pelo conteúdo deste diretório.
5. No editor, selecione e execute `setupControleDePonto`.
6. Autorize o acesso à planilha.
7. Abra **Execuções** ou **Registro de execução** e copie `spreadsheetUrl` e `apiKey` retornados.
8. Em **Implantar → Nova implantação → Aplicativo da Web**, configure:
   - Executar como: **Eu**.
   - Quem pode acessar: **Qualquer pessoa**.
9. Implante e copie a URL que termina em `/exec`.
10. No site, informe URL e chave no painel **Banco central (Google Sheets)** e clique em **Testar conexão**.

A implantação fica tecnicamente acessível pela Internet, mas o backend rejeita operações sem a chave. Mantenha essa chave fora do GitHub e entregue-a somente a quem realmente terá acesso à base. Como esta etapa não implementa contas individuais, qualquer pessoa que possua a chave terá acesso à base compartilhada inteira. Isso não substitui autenticação individual nem isolamento por colaborador.

## Importação de backup

No site, use **Importar backup local para o banco central** e selecione um arquivo JSON obtido por **Baixar backup completo**.

- A importação acrescenta lançamentos que ainda não existem.
- Lançamentos com ID ou assinatura já presentes são ignorados.
- Jornadas e escalas são atualizadas pela matrícula.
- A planilha não é limpa e nenhum registro central é removido.
- O procedimento pode ser repetido; a deduplicação evita inserir novamente os mesmos registros.

Importe o backup de cada navegador que contenha registros que ainda não estejam na base central.

## Comunicação entre GitHub Pages e Apps Script

O backend devolve uma pequena página HTML em um iframe e responde por `postMessage`. Isso evita depender de cabeçalhos CORS configuráveis no Content Service do Apps Script.

## Limites e operação

- Google Apps Script tem cotas diárias e limites de execução que podem mudar. Consulte a documentação oficial: https://developers.google.com/apps-script/guides/services/quotas
- O Google Sheets é uma base inicial apropriada para volumes modestos, não um banco relacional de alta concorrência.
- A planilha deve permanecer privada. Não compartilhe o arquivo com os usuários do site.
- Não coloque a chave API em arquivos, HTML, JavaScript público ou capturas de tela.
- Para separar os registros de cada pessoa, será necessário implementar autenticação individual e autorização no servidor em uma etapa futura.
