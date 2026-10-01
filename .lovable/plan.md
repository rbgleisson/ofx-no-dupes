# Simplificar o Resumo Mensal

## Implementação
- Exibir no fechamento apenas a sequência: `Saldo Anterior + Entradas Reais − Saídas Reais = Saldo para o Próximo Mês`.
- Calcular o saldo final com os mesmos valores de entradas e saídas reais já mostrados, sem transferências internas.
- Remover do fechamento os campos de saldo de aplicação, o Subtotal e o Total Geral, evitando fórmulas concorrentes.
- Manter o detalhamento por categoria, o bloco informativo de aplicações financeiras e rendimentos fora do fechamento.
- Aplicar a mesma sequência simples no Excel.
- Preservar o saldo anterior manual e seu encadeamento para os meses seguintes.

## Validação
- Conferir que `Saldo para o Próximo Mês = Saldo Anterior + Entradas Reais − Saídas Reais`.
- Conferir a mesma fórmula no diálogo e no Excel.
- Confirmar que a troca de mês continua trazendo o saldo anterior encadeado.
