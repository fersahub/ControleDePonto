# Controle de Ponto

Formulário web para lançamento, consulta e exportação de registros de jornada em operações de transporte.

## Funcionalidades

- Cadastro de colaborador, matrícula, datas e horários de início e término.
- Registro do intervalo, ordem do veículo, placa e tipo de serviço.
- Plantão oculta Origem e Destino; Viagem exibe e exige os dois campos.
- Validação de datas, horários e duração do intervalo.
- Cálculo da jornada líquida e das horas extras.
- Filtro mensal no histórico do site; a impressão respeita o mês selecionado.
- Exportação para Excel (.xlsx) com três abas: **Lançamentos**, **Resumo mensal** e **Instruções**.
- Filtro automático por coluna na planilha, incluindo Competência (mês).
- Exportação alternativa em CSV.

## Critério de horas extras

- Jornada bruta = data/hora final menos data/hora inicial.
- Horas trabalhadas = jornada bruta menos o intervalo descontado.
- Base contratual configurada = **7 horas e 20 minutos por lançamento**.
- Horas extras = o que exceder 7h20 de horas trabalhadas líquidas em cada lançamento.
- Horas normais = limitado a 7h20 por lançamento.
- O intervalo pode ser informado como duração (por exemplo, `01:00`, `1h`, `60 min`) ou como faixa (por exemplo, `12:00 às 13:00`). Em branco equivale a nenhum intervalo descontado.

A competência mensal usa o mês da **Data inicial** do lançamento. O cálculo considera cada lançamento como uma unidade de apuração e não distribui automaticamente jornadas que atravessam vários dias.

## Publicação no GitHub Pages

1. No repositório, acesse **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Acesse **Actions** e acompanhe o workflow **Publicar Controle de Ponto**.
4. Site: https://fersahub.github.io/ControleDePonto/

## Armazenamento e limites

Esta versão é estática. Os registros ficam no `localStorage` do navegador utilizado, portanto não são sincronizados entre computadores, navegadores ou usuários. Limpar os dados do navegador pode apagar os registros locais.

A exportação Excel inclui todos os registros armazenados naquele navegador. Use o filtro da coluna **Competência** na aba **Lançamentos** para selecionar um mês. No site, o filtro mensal limita o histórico e a impressão. A exportação Excel exige acesso ao CDN oficial SheetJS.

O cálculo é operacional, baseado na jornada configurada de 7h20 e no intervalo informado. Regras específicas de folha, adicionais noturnos, feriados, DSR ou convenções coletivas não são aplicadas. Antes de utilizar o sistema como controle oficial de ponto, implemente armazenamento central, autenticação, auditoria, backups e políticas de acesso.
