# Meu Controle de Jornada

Aplicativo pessoal, estático e instalável para registrar jornadas, intervalos, folgas e horas extras. O projeto funciona no GitHub Pages sem servidor ou conta de usuário; os dados permanecem no navegador.

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
- Backup completo em JSON, incluindo lançamentos e jornadas personalizadas, com restauração validada e confirmação antes de substituir os dados.
- Aplicativo preparado para uso offline após a primeira visita, por meio de Service Worker e cache dos arquivos essenciais.

## Critério de horas extras

- Jornada bruta = data/hora final menos data/hora inicial.
- Horas trabalhadas = jornada bruta menos o intervalo descontado.
- Jornada diária de referência = **7 horas e 20 minutos por matrícula**, podendo ser personalizada no aplicativo.
- Todos os lançamentos da mesma matrícula e data inicial compartilham a cota diária configurada para aquela matrícula.
- As horas trabalhadas são somadas por dia e as horas extras correspondem ao excedente diário.
- Para exibir os valores por lançamento, o sistema distribui primeiro as horas normais em ordem cronológica até completar 7h20; o restante é classificado como extra.
- Jornadas que atravessam a meia-noite são integralmente atribuídas à data inicial, conforme regra operacional definida.
- O intervalo pode ser informado como duração (por exemplo, `01:00`, `1h`, `60 min`) ou como faixa (por exemplo, `12:00 às 13:00`). Em branco equivale a nenhum intervalo descontado.

Intervalos e folgas aparecem nos relatórios e exportações, mas não entram nos totais de horas trabalhadas, normais ou extras.

A competência mensal usa o mês da **Data inicial** do lançamento. A apuração diária agrupa por matrícula + data inicial. Se houver vários lançamentos no mesmo dia, a jornada normal configurada para a matrícula é compartilhada entre eles, em ordem cronológica; o excedente diário é classificado como hora extra. Jornadas que atravessam a meia-noite são integralmente atribuídas à data inicial e não são divididas entre datas.

## Espelho mensal individual

Na seção **Espelho mensal individual**, selecione a competência e a matrícula para gerar o relatório. O espelho consolida dias com lançamento, horas trabalhadas, horas normais e horas extras, além de detalhar as jornadas e os serviços de cada dia. A impressão do espelho é isolada do restante da página. Os totais utilizam a mesma apuração diária configurada para a matrícula, aplicada ao histórico e às exportações.

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


## Jornadas personalizadas

Na seção **Minha jornada personalizada**, informe a matrícula e escolha a carga diária esperada: 4h, 6h, 7h20, 8h, 12h ou uma carga personalizada em HH:MM. A configuração fica salva localmente neste navegador e é aplicada aos lançamentos daquela matrícula, inclusive aos registros anteriores, atualizando a apuração de horas normais e extras, histórico, espelho mensal e exportações. Matrículas sem configuração continuam usando 7h20. Use **Usar padrão** para remover a personalização. Para escalas como 12x36, configure 12h como referência por dia trabalhado; esta versão não cria automaticamente o calendário alternado de trabalho e descanso.


## Backup, restauração e modo offline

Use **Baixar backup completo** para salvar um arquivo JSON com todos os lançamentos e as jornadas personalizadas. Para recuperar ou transferir os dados, use **Restaurar backup** em outro navegador e selecione o arquivo. A restauração substitui os dados locais existentes e pede confirmação antes de prosseguir.

O site pode ser instalado como aplicativo e abrir offline depois que os arquivos essenciais forem carregados uma primeira vez. A exportação CSV, os registros e os relatórios locais não dependem de servidor. A exportação Excel utiliza a biblioteca SheetJS carregada por CDN e, portanto, precisa de conexão com a internet se a biblioteca ainda não estiver em cache.

## Limites desta versão pessoal

- Os dados ficam exclusivamente no armazenamento local do navegador. Não existe login, sincronização entre dispositivos, compartilhamento ou backup automático em nuvem.
- A limpeza dos dados do navegador, perda do dispositivo ou falha física pode causar perda dos registros; mantenha cópias de backup fora do navegador.
- O aplicativo é um organizador pessoal de jornada e não deve ser apresentado como sistema oficial de registro eletrônico de ponto nem como substituto de obrigações legais trabalhistas.
- A jornada personalizada desta versão define uma carga diária por matrícula. Calendários semanais/cíclicos (5x2, 6x1, 12x36), feriados, adicional noturno, DSR e regras de convenções ainda não são calculados automaticamente.


## Planejador de escalas

A seção **Planejador de escalas** salva uma configuração independente por matrícula e projeta 30 ou 60 dias de trabalho, descanso e lançamentos:

- **5x2:** cinco dias trabalhados e dois dias sem turno, repetidos a partir da data-base informada.
- **6x1:** seis dias trabalhados e um dia sem turno, repetidos a partir da data-base informada.
- **12x36:** turno de 12 horas seguido por 36 horas de descanso, calculado a partir da data e do horário da primeira entrada. Turnos noturnos também são indicados como continuação no dia seguinte.
- **Personalizada:** permite definir quantos dias são trabalhados e quantos são de descanso em cada ciclo.

A projeção considera entrada, duração do turno e intervalo planejado. O calendário cruza as datas de trabalho com lançamentos de Plantão e Viagem da mesma matrícula. Dias passados de trabalho sem lançamento são sinalizados como **Sem lançamento**; isso não significa falta ou ausência, pois o aplicativo não conhece justificativas, atestados, férias ou alterações feitas pelo empregador.

As escalas ficam no armazenamento local e entram nos backups versão 2. O aplicativo continua aceitando backups anteriores versão 1. O planejamento não altera lançamentos, a jornada diária personalizada nem o cálculo atual de horas extras. A apuração continua diária, conforme a carga configurada em **Minha jornada personalizada**; o planejador não calcula limites semanais, DSR, adicional noturno, feriados ou regras legais/convenções.


## Planejador de escalas

A seção **Planejador de escalas** salva uma configuração independente por matrícula e projeta 30 ou 60 dias de trabalho, descanso e lançamentos:

- **5x2:** cinco dias trabalhados e dois dias sem turno, repetidos a partir da data-base informada.
- **6x1:** seis dias trabalhados e um dia sem turno, repetidos a partir da data-base informada.
- **12x36:** turno de 12 horas seguido por 36 horas de descanso, calculado a partir da data e do horário da primeira entrada. Turnos noturnos também são indicados como continuação no dia seguinte.
- **Personalizada:** permite definir quantos dias são trabalhados e quantos são de descanso em cada ciclo.

A projeção considera entrada, duração do turno e intervalo planejado. O calendário cruza as datas de trabalho com lançamentos de Plantão e Viagem da mesma matrícula. Dias passados de trabalho sem lançamento são sinalizados como **Sem lançamento**; isso não significa falta ou ausência, pois o aplicativo não conhece justificativas, atestados, férias ou alterações feitas pelo empregador.

As escalas ficam no armazenamento local e entram nos backups versão 2. O aplicativo continua aceitando backups anteriores versão 1. O planejamento não altera lançamentos, a jornada diária personalizada nem o cálculo atual de horas extras. A apuração continua diária, conforme a carga configurada em **Minha jornada personalizada**; o planejador não calcula limites semanais, DSR, adicional noturno, feriados ou regras legais/convenções.
