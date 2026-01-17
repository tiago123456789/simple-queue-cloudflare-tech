# Fila Simples

Um sistema de fila de mensagens confiável e fácil de usar construído no Cloudflare Workers. Alternativa de código aberto a serviços pagos como Zeplo ou Qstash.

A fila para pessoas que só sabem o que é API e como fazer solicitações

Leia em [Inglês](README.md)

## Por Que Escolher a Fila Simples?

- Configure uma vez
- Escala com suas necessidades sem alterar configurações
- Pague apenas pelo que usa
- Você precisa apenas saber o que é uma API e como fazer solicitações HTTP
- Você precisa executar automações ou ações que levam muito tempo, e ao mesmo tempo limitar ações para evitar sobrecarregar seu servidor.

Imagine enviar mensagens entre seus apps sem se preocupar com elas se perderem ou seus sistemas travarem. A Fila Simples torna isso simples e acessível!

### Benefícios Principais:

- **Configuração Fácil**: Configure uma vez e esqueça. Nenhuma configuração complexa de servidor necessária.
- **Pague Apenas pelo que Usa**: Tecnologia serverless significa que você paga apenas pelo uso real – economize dinheiro!
- **Entrega Confiável**: Mensagens são armazenadas com segurança e entregues mesmo se seus apps estiverem ocupados ou offline.
- **Tentativas Automáticas**: Se algo der errado, tenta novamente automaticamente.
- **Organize Suas Mensagens**: Agrupe mensagens por app ou tarefa para manter tudo organizado.
- **Não Precisa de Especialistas Técnicos**: Funciona com solicitações HTTP simples – se você conhece APIs, está pronto.
- **Econômico**: Não precisa de equipes caras de DevOps ou infraestrutura.
- **Seguro**: Proteja suas mensagens com chaves de API.

## Como Funciona

1. **Envie Mensagens**: Seu app envia mensagens via solicitações HTTP simples.
2. **Armazene com Segurança**: Mensagens são armazenadas em uma fila confiável.
3. **Processe Automaticamente**: Um agendador pega as mensagens e as envia para seus apps de destino.
4. **Trate Erros**: Se a entrega falhar, tenta novamente ou move para uma fila de "carta morta" para revisão.

## Início Rápido

1. **Clone o Projeto**: Baixe o código do GitHub.
2. **Instale Dependências**: Execute `npm install`.
3. **Execute Localmente**: Use `npm run dev` para testar em sua máquina.
4. **Implante**: Execute `npm run deploy` para colocar em produção no Cloudflare.
5. **Configure o Agendador**: Use Supabase para criar um trabalho cron simples que processa mensagens a cada poucos segundos.

Para configuração detalhada, verifique a [documentação completa](#como-executar) abaixo.

## Recursos

- **Publicação de Mensagens**: Envie mensagens para a fila facilmente.
- **Processamento Automático**: Trata da entrega em segundo plano.
- **Mecanismo de Tentativa**: Continua tentando se as coisas não funcionarem na primeira vez.
- **Fila de Carta Morta**: Mensagens falhadas vão para aqui para revisão manual.
- **Prevenção de Duplicatas**: Evita enviar a mesma mensagem duas vezes.
- **Organização por Grupos**: Separe mensagens por app ou tarefa.
- **Validação de Dados**: Garante que as mensagens correspondam aos formatos esperados.

## Visão Geral da Arquitetura

![Arquitetura](./architecture.png)

## Desempenho e Custos

- **Custo Baixo**: Processar 1 milhão de mensagens custa cerca de $5.
  - 1 milhão de Cloudflare Workers para publicar: $0.33
  - 1 milhão de Cloudflare Workers para consumir as mensagens: $0.33
  - 1 milhão de Cloudflare Durable Objects armazenamento para os dados da fila: $2
  - 1 milhão de Cloudflare Durable Objects obter e deletar os dados da fila: $2 (atualizar registro ao consumir a mensagem e operação de exclusão quando a mensagem for processada com sucesso)
- **Escalável**: Cresce com suas necessidades sem configuração extra.

## Obtenha Ajuda

Precisa de assistência? Estamos aqui para ajudar!

Email: [tiagorosadacost@gmail.com](mailto:tiagorosadacost@gmail.com)

---

## Detalhes Técnicos (Para Desenvolvedores)

### Tecnologias Usadas

- Cloudflare Workers
- Durable Objects (armazenamento SQLite)
- Node.js & TypeScript
- Supabase (para agendamento)

### Instruções Completas de Configuração

- Clone o repositório
- Execute `npm install`
- Execute `npm run dev` para desenvolvimento local
- Execute `npm run deploy` para implantar no Cloudflare Workers
- Importe a coleção Insomnia `Insomnia_2026-01-11.yaml` para testes

### Configurando Grupos

Edite `groups.json` para adicionar novos grupos (ex.: user_queue, product_queue).

### Validação de Dados

Use [esta ferramenta](https://transform.tools/json-to-zod) para gerar esquemas de validação e adicioná-los a `src/schemas-validation.ts`.

### Configuração do Agendador

Crie uma conta Supabase e configure um trabalho cron:

```sql
select net.http_get(
    url:='YOUR_QUEUE_URL/process',
    headers:=jsonb_build_object('x-api-key', 'YOUR_API_KEY'),
    timeout_milliseconds:=60000
);
```

### Variáveis de Ambiente

- `API_KEY`: Protege sua aplicação
- `HTTP_REQUEST_TIMEOUT`: Tempo limite de solicitação em segundos
- `TOTAL_RETRIES_BEFORE_DQL`: Tentativas de repetição antes da carta morta
- `TOTAL_MESSAGES_PULL_PER_TIME`: Mensagens processadas por lote

### Limitações (Plano Gratuito)

- Limite de memória de 128MB
- 1.000 solicitações/minuto
- 100.000 gravações/dia

### Resultados de Teste de Carga

Encontre scripts na pasta `loadtest/`. Desempenho de exemplo:

- 3k solicitações em 14.35s
- Latência média: 568ms
- Até 1.188 req/seg
