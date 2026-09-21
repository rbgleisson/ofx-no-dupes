# Corrigir limite do Resumo Mensal

## Implementação
- Criar um helper reutilizável que execute consultas em páginas de 1.000 registros, ordenadas por `date` e `id`.
- Aplicar o helper às consultas do mês e do saldo anterior, tanto no diálogo quanto na exportação.
- Preservar integralmente cálculos, apresentação e edição manual do saldo anterior.

## Validação
- Testar o helper com mais de 1.000 registros simulados e confirmar que todas as páginas são reunidas na ordem correta.
- Executar os testes existentes e confirmar a compilação do aplicativo.
