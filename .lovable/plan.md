# Auditar e corrigir os saldos anteriores mensais

## Implementação
- Centralizar em uma única função a regra do Saldo Anterior usada na tela principal, no Resumo Mensal e no Excel.
- Quando houver saldo manual salvo, tratá-lo como âncora e encadear os meses seguintes somente por Entradas Reais menos Saídas Reais, ignorando transferências.
- Quando ainda não houver âncora manual, usar janeiro como início implícito do ano: calcular o saldo bancário em 1º de janeiro e encadear os meses seguintes pela movimentação real.
- Fazer o Resumo Mensal e a exportação Excel usarem exatamente essa mesma regra, eliminando divergências entre telas.
- Preservar lançamentos, saldos de abertura, aplicações, rendimentos, categorias, fórmulas do Subtotal e Total Geral.

## Auditoria e validação
- Gerar uma conferência mês a mês para cada organização com dados, comparando o saldo anterior de cada mês com o fechamento real do mês anterior.
- Cobrir em testes: janeiro sem âncora, sequência de vários meses, virada de ano, âncora manual e transferências ignoradas no encadeamento.
- Validar na tela os meses de janeiro e fevereiro de 2026 e confirmar que o Excel recebe o mesmo Saldo Anterior exibido.
- Não alterar nem excluir dados financeiros durante a auditoria.
