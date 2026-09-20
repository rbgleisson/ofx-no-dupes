# Corrigir autorização multi-tenant em manage-users

## Objetivo
Reforçar apenas as ações `create` e `delete` da função de gestão de usuários, preservando integralmente `create_organization` e `delete_organization`.

## Implementação
- Na criação, derivar sempre a organização do chamador quando ele não for Super Admin.
- Para Super Admin, aceitar a organização informada somente após confirmar que ela existe; sem organização válida, retornar erro claro.
- Antes de autorizar o e-mail, consultar o cadastro existente e retornar HTTP 409 quando estiver ligado a outra organização, sem sobrescrever dados.
- Validar erros de gravação e evitar deixar usuário criado parcialmente caso perfil, permissões ou papel falhem.
- Na exclusão, localizar o perfil e organização do alvo; retornar 404 se não houver perfil.
- Para não Super Admin, exigir mesma organização e impedir exclusão de `owner` ou `super_admin`; manter a proibição de autoexclusão para todos.
- Manter acesso total do Super Admin sobre outros usuários.

## Validação
- Publicar novamente a função `manage-users`.
- Testar os quatro cenários solicitados com usuários/organizações temporários ou dados controlados, removendo os registros temporários ao final.
- Confirmar os códigos esperados: 403 entre organizações, organização do chamador na criação comum, 409 para e-mail autorizado em outra organização e sucesso normal para Super Admin.
