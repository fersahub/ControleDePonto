# Controle de Ponto

Formulário web para lançamento e consulta de registros de jornada em operações de transporte.

## Funcionalidades da versão inicial

- Cadastro de colaborador, matrícula, datas e horários de início e término.
- Campo de intervalo.
- Identificação do veículo por ordem e placa.
- Seleção de serviço: **Plantão** ou **Viagem**.
- Campos de origem e destino exibidos somente quando o tipo de serviço for **Viagem**.
- Validação dos campos obrigatórios e da sequência de data/horário.
- Cálculo demonstrativo da duração entre início e término.
- Histórico com exclusão de registros.
- Exportação dos lançamentos para CSV (compatível com Excel e Google Sheets).
- Layout responsivo para computador, tablet e celular.

## Publicar no GitHub Pages

1. No repositório, acesse **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Acesse a aba **Actions** e acompanhe o workflow **Publicar Controle de Ponto**.
4. Quando a publicação terminar com sucesso, o site ficará disponível em:
   https://fersahub.github.io/ControleDePonto/

O workflow é executado em novos commits na branch `main` e também pode ser iniciado manualmente pela aba Actions.

## Armazenamento e integração com planilha

Esta versão é um site estático. Os registros ficam salvos no `localStorage` do navegador usado para fazer os lançamentos; portanto, não são sincronizados entre computadores, navegadores ou usuários. Limpar os dados do navegador pode apagar os registros locais.

O botão **Exportar planilha** gera um arquivo CSV que pode ser aberto no Excel ou importado no Google Sheets. A conexão automática com uma planilha central será implementada em uma próxima etapa.

**Atenção:** antes de utilizar o sistema como controle oficial de ponto, será necessário definir a política de armazenamento, acesso, auditoria, cópias de segurança e integração centralizada. O cálculo exibido nesta versão representa apenas o intervalo entre horário inicial e final e não desconta automaticamente o intervalo informado.
