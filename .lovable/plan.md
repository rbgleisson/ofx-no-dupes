# Privatizar anexos sem alterar URLs salvas

## Alterações
- Tornar `transaction-docs` privado pela configuração nativa do armazenamento, preservando políticas, objetos e URLs já gravadas.
- Remover de `openAttachment` as duas tentativas de abrir a URL pública; qualquer caminho inválido ou falha de download exibirá “Não foi possível abrir o anexo”.
- Revisar a visualização no detalhe, a abertura pela tabela e o backup para garantir downloads autenticados pelo armazenamento.
- Manter o upload e o uso de `getPublicUrl` somente para compor o caminho persistido, sem migração de dados.

## Validação
- Confirmar que uma URL pública antiga falha sem sessão.
- Confirmar que um anexo antigo da própria organização abre após download autenticado.
- Enviar e abrir um anexo novo, mantendo o mesmo formato de URL salva.
- Gerar um backup e confirmar que os anexos entram no arquivo.

## Observação técnica
A privacidade do bucket será alterada pela API nativa de armazenamento, equivalente ao `UPDATE storage.buckets`, porque alterações diretas nessa tabela não são aceitas em migrações. Nenhuma política será modificada.
