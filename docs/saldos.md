# Como o sistema calcula os saldos do mês

Os mesmos nomes aparecem na tela principal e no Resumo Mensal.

| Nome | O que é |
|---|---|
| **Saldo Anterior** | Saldo com que o mês começa. |
| **Entradas** | Soma dos valores positivos do mês. |
| **Saídas** | Soma dos valores negativos do mês (mostrada sem sinal). |
| **Saldo do mês** | Saldo Anterior + Entradas − Saídas. |
| **Total com aplicações** | Saldo do mês + valores informados como "Saldo de Aplicação". |

## Saldo Anterior

1. Se alguém **salvou manualmente** o Saldo Anterior do mês no Resumo Mensal, esse valor é usado.
2. Se não, e existe um valor salvo em um mês anterior, o sistema parte desse valor e soma as Entradas e Saídas dos meses seguintes até o mês atual (encadeamento).
3. Se nunca houve valor salvo, é calculado a partir dos **saldos iniciais das contas** e dos lançamentos anteriores.

## O que fica de fora de Entradas e Saídas

- **Transferências internas** (aplicações, resgates, PIX entre contas próprias): o dinheiro só muda de lugar.
- **Lançamentos sem conta bancária**: precisam de uma conta para entrar no cálculo.

Ambos aparecem no painel "Como foi calculado?" com quantidade, soma e a lista de lançamentos, para que possam ser corrigidos.

## Exemplo

| Item | Valor |
|---|---|
| Saldo Anterior (salvo manualmente) | R$ 10.000,00 |
| (+) Entradas — 12 lançamentos | R$ 8.500,00 |
| (−) Saídas — 20 lançamentos | R$ 6.200,00 |
| **(=) Saldo do mês** | **R$ 12.300,00** |
| (+) Saldo de Aplicação Poupança | R$ 3.000,00 |
| **(=) Total com aplicações** | **R$ 15.300,00** |

Ficaram de fora: 2 transferências (R$ 3.000,00 aplicados na poupança) e 1 lançamento sem conta (R$ 150,00).
O Saldo Anterior do mês seguinte será R$ 12.300,00 (o Saldo do mês), se ninguém salvar outro valor.

## Fechamento do mês

Ao fechar um mês, o sistema grava o Saldo do mês e o Total com aplicações daquele momento.
Os lançamentos do mês ficam bloqueados. Se depois o cálculo atual ficar diferente do gravado
(por exemplo, por mudança em um mês anterior ainda aberto), um aviso mostra a diferença.
Somente quem fechou pode liberar o mês.
