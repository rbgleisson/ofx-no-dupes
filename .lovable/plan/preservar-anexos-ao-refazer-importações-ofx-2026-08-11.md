# Preservar anexos ao refazer importações OFX

## Objetivo
Permitir refazer as importações de todas as contas sem perder anexos já vinculados.

## Alterações
- Mudar a limpeza em massa para excluir somente lançamentos sem anexo.
- Manter no banco os lançamentos que possuem `attachment_url`, preservando também o mesmo ID interno e o arquivo armazenado.
- Na confirmação da limpeza, informar quantos lançamentos com anexo serão protegidos, em vez de oferecer uma exclusão destrutiva como fluxo padrão.
- Manter a reimportação por FITID: quando o OFX reencontrar um lançamento protegido, ele será atualizado no mesmo registro sem alterar `attachment_url`.
- Ajustar a mensagem final para orientar que os registros protegidos serão conciliados na nova importação.

## Resultado esperado
O usuário poderá limpar e refazer os OFXs. Lançamentos sem anexos serão recriados; lançamentos com anexos permanecerão e serão atualizados pelo FITID, sem perder seus links.

## Validação
- Verificar que a limpeza usa filtro `attachment_url IS NULL`.
- Verificar que o fluxo de importação continua omitindo `attachment_url` nas atualizações.
- Executar os testes relacionados à loja de transações/importação.
