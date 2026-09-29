# Persistir e encadear o Saldo Anterior mensal

## Implementação
- Criar a tabela `monthly_opening_balances` com um valor por organização, ano e mês, validações de período, auditoria de usuário/data e exclusão em cascata com a organização.
- Liberar acesso somente a usuários autenticados da própria organização, com políticas separadas de leitura, criação, alteração e exclusão, além do gatilho de atualização automática.
- Criar um módulo compartilhado para buscar as duas âncoras mais recentes até o mês escolhido, salvar/remover o valor manual e calcular o saldo encadeado.
- No cálculo encadeado, usar o valor salvo no próprio mês quando existir; caso contrário, partir da última âncora anterior e somar somente lançamentos reais entre a âncora e o mês escolhido, ignorando transferências. Sem âncora, preservar o cálculo atual.
- Atualizar o Resumo Mensal para carregar o saldo salvo ou encadeado ao abrir e ao trocar mês/ano.
- Salvar no `onBlur` somente quando o valor digitado diferir do valor calculado; remover a personalização quando voltar ao calculado.
- Mostrar o estado do campo como “definido por você (salvo)” ou “encadeado do mês anterior”.
- Fazer o botão de restaurar apagar a personalização do mês e voltar ao valor encadeado/calculado.
- Antes de exportar, persistir qualquer alteração pendente e enviar sempre o saldo atualmente exibido para o Excel.

## Detalhes técnicos
- A âncora considera o primeiro dia do mês salvo como início e o primeiro dia do mês selecionado como limite exclusivo.
- A consulta de lançamentos para encadeamento continuará paginada e ordenada por data e ID.
- A fórmula de Subtotal, Total Geral, categorias, aplicações e rendimentos não será alterada.
- Adicionar testes unitários para fallback sem âncora, encadeamento sem transferências e uso direto do valor no mês da âncora.

## Validação
- Salvar `16.113,96` em janeiro/2025, abrir fevereiro/2025 e confirmar o saldo encadeado.
- Voltar a janeiro/2025 e confirmar que o valor manual permanece.
- Restaurar o valor calculado e confirmar que a personalização do mês foi removida.
- Exportar o Excel e confirmar que o Saldo Anterior é idêntico ao exibido no diálogo.
- Executar os testes do saldo mensal e verificar que a aplicação continua sem erros.
