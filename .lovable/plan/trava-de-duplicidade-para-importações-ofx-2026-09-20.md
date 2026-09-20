# Trava de duplicidade para importações OFX

## Alterações
- Criar o índice único parcial por organização, conta e FITID exatamente como solicitado, mantendo o índice comum existente.
- No reenvio individual da importação, contar violações `23505` como lançamentos já existentes ignorados, sem alterar updates por FITID nem anexos.
- Incluir a quantidade ignorada na mensagem final quando for maior que zero.
- Manter o botão de confirmação bloqueado e com indicador de carregamento durante toda a importação.

## Validação
- Aplicar a migração sem modificar dados; se houver duplicidade, interromper e apresentar o erro.
- Verificar importação inicial, repetição do mesmo arquivo, bloqueio contra clique duplo e preservação de anexo na reimportação.
