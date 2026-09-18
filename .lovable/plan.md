# Concluir exportação Alterdata para o contador

## Resultado
O envio ao contador permitirá escolher entre o modelo genérico já existente e o modelo fixo “Alterdata — Lançamentos Contábeis”.

## Implementação
- Adicionar no diálogo de envio a escolha do formato.
- Enviar o formato selecionado junto com mês e ano.
- No formato Alterdata, gerar exatamente estas colunas e ordem: `lancto auto`, `debito`, `credito`, `data`, `valor`, `cód histórico`, `complemento historico`.
- Preencher débito com o código fixo da organização; preencher lançamento automático e crédito com o código contábil da transação.
- Excluir transferências internas, como no relatório atual.
- Bloquear o envio Alterdata quando houver lançamentos sem conta contábil e informar quantos precisam de revisão, evitando planilhas incompletas.
- Manter o formato genérico e suas colunas salvas sem alterações.
- Preservar nome do arquivo, assunto e destinatário já configurados.

## Validação
- Verificar erros de compilação.
- Testar no navegador a escolha dos dois formatos e o aviso de revisão.
- Publicar novamente a função de envio e testar sua resposta autenticada quando houver sessão disponível.
