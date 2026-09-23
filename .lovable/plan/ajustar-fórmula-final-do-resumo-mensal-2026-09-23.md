# Ajustar fórmula final do Resumo Mensal

## Implementação
- Manter `Saldo Anterior`, `Entradas Reais` e `Despesas Reais` como estão hoje.
- Renomear o resultado intermediário para `Subtotal`, calculado por `Saldo Anterior + Entradas Reais − Despesas Reais`.
- Manter um campo editável para cada conta de aplicação, usando os valores mensais já salvos por conta.
- Somar os saldos informados de todas as aplicações ao Subtotal.
- Exibir `Total Geral = Subtotal + soma dos Saldos de Aplicação`.
- Aplicar a mesma ordem, nomes e fórmula no diálogo e no Excel.
- Preservar os blocos de categorias, saldo consolidado das aplicações, rendimentos e os demais cálculos do relatório.

## Detalhes técnicos
- Atualizar a função compartilhada de fechamento para retornar `subtotal`, total das aplicações e `totalGeral`.
- Reutilizar a persistência atual de `aplicado_no_mes` por conta, mês e ano, alterando apenas seu significado visual para `Saldo de Aplicação`.
- Atualizar os testes da fórmula para cobrir nenhuma aplicação, uma aplicação e várias contas.

## Validação
- Confirmar que aplicações zeradas deixam `Total Geral` igual ao `Subtotal`.
- Confirmar que os valores de várias contas são somados ao `Subtotal`.
- Confirmar que os valores permanecem após fechar e reabrir o resumo.
- Conferir a mesma fórmula no arquivo Excel e validar que o restante do relatório não mudou.
