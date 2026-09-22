# Refazer fechamento do Resumo Mensal

## Implementação
- Adicionar `aplicado_no_mes` à posição mensal de aplicações, com padrão zero e mantendo as políticas atuais.
- Carregar, editar e salvar um valor mensal por conta de aplicação no diálogo, preservando-o ao fechar e reabrir.
- Trocar o fechamento do diálogo pela cascata: Saldo Anterior, Entradas Reais, Saídas Reais, Saldo Acumulado, aplicações por conta e Saldo para o Próximo Mês.
- Gerar a mesma cascata no Excel usando os valores mensais salvos, sem alterar categorias, posições, rendimentos ou os demais cálculos.
- Remover apenas do fechamento antigo as referências a Movimento Bancário, ao card separado de Saldo do Mês e à versão anterior de aplicado/resgatado.

## Detalhes técnicos
- `Saldo Acumulado = Saldo Anterior + Entradas Reais − Saídas Reais`.
- `Saldo para o Próximo Mês = Saldo Acumulado − soma(aplicado_no_mes)`.
- O salvamento reutilizará o registro único de `investment_positions` por conta, ano e mês, sem apagar saldo ou rendimento já registrados.

## Validação
- Cobrir as fórmulas com testes automatizados, incluindo aplicações zeradas e múltiplas contas.
- Conferir no diálogo que os valores persistem após fechar e reabrir.
- Conferir a planilha gerada e validar que o restante do Resumo Mensal não mudou.
