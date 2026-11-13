# Controle de Ponto

Formulário web para lançamento, consulta e exportação de registros de jornada em operações de transporte.

## Funcionalidades

- Cadastro de colaborador, matrícula, datas e horários de início e término.
- Registro do intervalo, ordem do veículo, placa e tipo de serviço.
- Plantão oculta Origem, Destino, Nº de ordem do veículo e Placa; esses quatro campos ficam desativados e não são exigidos nem gravados no novo lançamento. Viagem exibe e exige todos eles.
- Intervalo registra início e término, sem contabilizar horas trabalhadas ou extras.
- Folga registra somente colaborador, matrícula e data, sem exigir horários e sem alterar a apuração da jornada.
- Validação de datas, horários e duração do intervalo.
- Verificação de possíveis lançamentos duplicados e jornadas sobrepostas para a mesma matrícula, com confirmação antes de gravar registros conflitantes.
- Cálculo da jornada líquida e apuração diária de horas extras por matrícula + data inicial, com distribuição cronológica entre lançamentos.
- Filtro mensal no histórico do site; a impressão respeita o mês selecionado.
- Espelho mensal individual no site, com seleção de competência e matrícula, resumo de horas e detalhamento diário, incluindo folgas e intervalos não contabilizados, pronto para impressão.
- Exportação para Excel (.xlsx) com quatro abas: **Lançamentos**, **Resumo mensal**, **Resumo por colaborador** e **Instruções**.
- Resumo individual agrupado por competência + matrícula, com lançamentos, plantões, viagens, jornada bruta, horas trabalhadas e horas extras.
- Filtros automáticos por competência, colaborador e matrícula no resumo individual; para impressão, aplique os filtros e use Arquivo → Imprimir, preferencialmente em A4 e orientação paisagem.
- Filtro automático por coluna na planilha, incluindo Competência (mês).
- Exportação alternativa em CSV.

## Critério de horas extras

- Jornada bruta = data/hora final menos data/hora inicial.
- Horas trabalhadas = jornada bruta menos o intervalo descontado.
- Base contratual configurada = **7 horas e 20 minutos por colaborador em cada data inicial**.
- Todos os lançamentos da mesma matrícula e data inicial compartilham a mesma cota diária de 7h20.
- As horas trabalhadas são somadas por dia e as horas extras correspondem ao excedente diário.
- Para exibir os valores por lançamento, o sistema distribui primeiro as horas normais em ordem cronológica até completar 7h20; o restante é classificado como extra.
- Jornadas que atravessam a meia-noite são integralmente atribuídas à data inicial, conforme regra operacional definida.
- O intervalo pode ser informado como duração (por exemplo, `01:00`, `1h`, `60 min`) ou como faixa (por exemplo, `12:00 às 13:00`). Em branco equivale a nenhum intervalo descontado.

Intervalos e folgas aparecem nos relatórios e exportações, mas não entram nos totais de horas trabalhadas, normais ou extras.

A competência mensal usa o mês da **Data inicial** do lançamento. A apuração diária agrupa por matrícula + data inicial. Se houver vários lançamentos no mesmo dia, a jornada normal de 7h20 é compartilhada entre eles, em ordem cronológica; o excedente diário é classificado como hora extra. Jornadas que atravessam a meia-noite são integralmente atribuídas à data inicial e não são divididas entre datas.

## Espelho mensal individual

Na seção **Espelho mensal individual**, selecione a competência e a matrícula para gerar o relatório. O espelho consolida dias com lançamento, horas trabalhadas, horas normais e horas extras, além de detalhar as jornadas e os serviços de cada dia. A impressão do espelho é isolada do restante da página. Os totais utilizam a mesma apuração diária de 7h20 aplicada ao histórico e às exportações.

## Verificação de conflitos

Antes de salvar, o sistema compara a matrícula e o período informado com os registros já existentes neste navegador. Mesmo início e término para a mesma matrícula são tratados como possível duplicidade; períodos que se cruzam são sinalizados como possível sobreposição. Em ambos os casos, o usuário pode cancelar a gravação ou confirmar que deseja prosseguir. Lançamentos distintos e sequenciais são permitidos. A verificação não identifica colaboradores por nome, e sim pela matrícula.

## Publicação no GitHub Pages

1. No repositório, acesse **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Acesse **Actions** e acompanhe o workflow **Publicar Controle de Ponto**.
4. Site: https://fersahub.github.io/ControleDePonto/

## Armazenamento e limites

Esta versão é estática. Os registros ficam no `localStorage` do navegador utilizado, portanto não são sincronizados entre computadores, navegadores ou usuários. Limpar os dados do navegador pode apagar os registros locais.

A exportação Excel inclui todos os registros armazenados naquele navegador. Use o filtro da coluna **Competência** na aba **Lançamentos** para selecionar um mês. Na aba **Resumo por colaborador**, filtre Competência, Colaborador ou Matrícula para consultar e imprimir o resumo individual. Depois de filtrar, use Arquivo → Imprimir; recomenda-se papel A4, orientação paisagem e ajuste à largura de uma página. No site, o filtro mensal limita o histórico e a impressão. O espelho individual é gerado diretamente na página, após selecionar competência e matrícula, e pode ser impresso separadamente. A exportação Excel exige acesso ao CDN oficial SheetJS.

O cálculo é operacional, baseado na jornada configurada de 7h20 e no intervalo informado. Regras específicas de folha, adicionais noturnos, feriados, DSR ou convenções coletivas não são aplicadas. Antes de utilizar o sistema como controle oficial de ponto, implemente armazenamento central, autenticação, auditoria, backups e políticas de acesso.
