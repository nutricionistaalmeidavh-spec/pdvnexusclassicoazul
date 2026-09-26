# Design — foto do produto no caixa + captura pelo celular

Data: 2026-09-26
Branch: `feat/product-image-mobile-capture`
Escopo: etapas 6, 7 e 8 do roadmap de foto de produto, somente Windows 10 nesta linha.

## 1. Objetivo

Completar o fluxo de foto do produto já iniciado no PDV Nexus Clássico Azul:

1. mostrar no caixa a foto principal cadastrada no produto;
2. permitir que o operador gere um QR Code no cadastro e fotografe o produto com um celular na mesma rede local;
3. receber essa foto diretamente no desktop, validar, salvar no armazenamento local existente e associá-la ao produto;
4. cobrir o fluxo com QA automatizado e smoke empacotado.

O core continua R$ 0, local/self-hosted e sem serviço externo obrigatório.

## 2. Estado atual

A `main` já possui:

- `imageRef?: string` em `CatalogProduct`;
- seleção de JPG/PNG/WebP no Electron;
- limite de 5 MB;
- armazenamento em `userData/pdv-product-images`;
- `artisys-upload` para validação;
- `artisys-files` para confinamento e escrita local;
- preview, substituição e remoção no formulário de produto;
- persistência do `imageRef` no snapshot/SQLite do PDV.

A continuação deve reutilizar esse mesmo contrato e diretório. Não haverá um segundo armazenamento de imagens.

## 3. Etapa 6 — exibição da foto no caixa

### Comportamento

O caixa passa a manter um produto visualmente ativo para apresentação. A prioridade será:

1. produto recém-adicionado à venda;
2. item selecionado/mais recente da venda;
3. produto destacado pela busca quando aplicável.

Quando esse produto tiver `imageRef`, o renderer resolve a URL através do bridge já existente e exibe a imagem numa área fixa do caixa. Sem foto, mostra um placeholder neutro.

### Regras

- o `imageRef` continua sendo a única referência persistida;
- a URL local da imagem é resolvida apenas em runtime;
- falha ao encontrar arquivo não quebra a venda: volta para placeholder;
- nenhuma imagem é convertida para base64 dentro do snapshot/SQLite;
- o caixa não altera nem apaga a imagem.

## 4. Etapa 7 — captura pelo celular via QR Code

### Experiência no desktop

No formulário de produto haverá a ação **“Tirar foto pelo celular”** ao lado de “Selecionar foto”.

Ao acioná-la, o Electron:

1. cria uma sessão temporária vinculada ao produto em edição;
2. gera token criptograficamente aleatório de uso único;
3. inicia, se necessário, um servidor HTTP temporário em porta dinâmica;
4. escolhe um IPv4 privado da máquina para formar a URL LAN;
5. gera QR Code dessa URL local;
6. devolve ao renderer `sessionId`, URL, QR em data URL e horário de expiração.

O formulário mostra o QR, a URL curta como fallback e um estado: aguardando / recebida / expirada / cancelada.

### Página móvel

A URL do QR abre uma página HTML mínima servida pelo próprio Electron, sem CDN, login ou recurso externo.

A página contém:

```html
<input type="file" accept="image/*" capture="environment">
```

Assim o navegador móvel pode abrir diretamente a câmera traseira sem depender de `getUserMedia()` ou HTTPS. Após a captura, a página envia o `File` como corpo binário bruto (`fetch`) para o endpoint da sessão, preservando `Content-Type` e nome em cabeçalho próprio.

### Upload

Endpoint lógico:

- `GET /capture/<token>` — página móvel;
- `POST /capture/<token>/image` — corpo binário da imagem.

O servidor acumula no máximo 5 MB + pequena margem de framing e rejeita imediatamente excesso de tamanho. Depois do recebimento:

1. normaliza os metadados recebidos;
2. valida MIME/tamanho via `artisys-upload`;
3. salva via `artisys-files` no mesmo workspace `pdv-product-images`;
4. produz novo `imageRef` relativo;
5. marca a sessão como `received`;
6. invalida o token para novos uploads.

O renderer consulta o status da sessão pelo bridge. Ao receber `imageRef`, atualiza `productDraft.imageRef` e o preview usando o mesmo comportamento da seleção desktop.

### Sessão

Cada sessão terá:

- `id` interno aleatório;
- `token` aleatório com entropia suficiente;
- código do produto/draft associado;
- `createdAt` e `expiresAt`;
- estado `waiting | received | expired | cancelled`;
- no máximo um upload aceito.

Prazo padrão: **5 minutos**.

Sessões expiram em memória; não entram no SQLite e não sobrevivem ao fechamento do app.

### Rede local

O servidor escuta apenas durante existência de sessões ativas e fecha quando não houver mais nenhuma. Para o celular acessar, desktop e celular devem estar na mesma rede local e o firewall do Windows deve permitir a conexão LAN ao executável.

Não haverá túnel de internet, relay, cloud, Firebase, S3 ou serviço pago.

### QR Code

Usar uma biblioteca open source embarcada localmente no desktop para gerar o QR como data URL. Ela será dependência de build/runtime do Electron e não fará chamadas de rede.

## 5. Segurança

Obrigatório:

- token aleatório não sequencial;
- token de uso único;
- validade de 5 minutos;
- vínculo da sessão ao draft/produto que a criou;
- apenas JPG, PNG ou WebP;
- limite de 5 MB;
- `Content-Type` validado contra política existente;
- nome do arquivo nunca usado como caminho direto;
- caminho final gerado pelo desktop e confinado por `artisys-files`;
- nenhuma listagem de arquivos disponível pela página móvel;
- endpoint desconhecido retorna 404;
- sessão expirada/cancelada retorna 410;
- segundo upload para token usado retorna 409;
- resposta sem detalhes de caminho absoluto do desktop.

A página móvel recebe apenas nome/código necessário para orientar a captura, sem dados de clientes, vendas ou configuração do estabelecimento.

## 6. Bridges / contratos

O `desktop-runtime` será ampliado com um bridge de captura móvel, separado do bridge de seleção local.

Contrato previsto:

```ts
type DesktopPdvMobileCaptureSession = {
  sessionId: string;
  url: string;
  qrDataUrl: string;
  expiresAt: string;
};

type DesktopPdvMobileCaptureStatus = {
  state: "waiting" | "received" | "expired" | "cancelled";
  imageRef?: string;
  imageUrl?: string;
};

type DesktopPdvMobileCaptureBridge = {
  start(productCode: string, productName?: string): Promise<DesktopPdvMobileCaptureSession>;
  status(sessionId: string): Promise<DesktopPdvMobileCaptureStatus>;
  cancel(sessionId: string): Promise<boolean>;
};
```

Preload expõe apenas essas operações. O renderer não recebe acesso arbitrário a sockets, filesystem ou HTTP server.

## 7. Ciclo de vida da imagem e persistência

Foto recebida pelo celular segue as mesmas regras da foto selecionada no desktop:

- antes de salvar o produto, nova imagem pertence ao draft;
- cancelar edição remove imagem temporária recém-capturada;
- substituir foto coloca a referência antiga na fila de remoção;
- imagem antiga só é apagada depois que o snapshot com a nova referência foi persistido com sucesso;
- exclusão do produto mantém o mesmo mecanismo de remoção segura já implementado.

## 8. QA — etapa 8

### Testes automatizados

Adicionar testes para:

1. caixa contém contrato de renderização de foto e placeholder;
2. bridge de captura móvel está exposto somente pelas operações previstas;
3. criação de sessão produz token, URL e expiração;
4. sessão expira após prazo configurado;
5. cancelamento invalida sessão;
6. segundo upload é rejeitado;
7. MIME não permitido é rejeitado;
8. payload acima de 5 MB é rejeitado;
9. JPG/PNG/WebP válido é salvo dentro do workspace local;
10. path traversal não é possível;
11. upload real via HTTP localhost percorre o endpoint até gerar `imageRef`;
12. `imageRef` recebido entra no mesmo fluxo de persistência do produto;
13. produto sem imagem continua funcional no caixa;
14. Windows 7 permanece sem alterações.

### Pipeline final

Rodar e exigir verde para:

- `npm audit --audit-level=high`;
- typecheck;
- testes de negócio existentes;
- testes de upgrade;
- testes Classic Blue/UI;
- novos testes de captura móvel e imagem no caixa;
- build do renderer;
- build do instalador Windows 10;
- assert da versão Electron empacotada;
- smoke gráfico do executável empacotado;
- verificação de que a árvore Windows 7 não mudou.

## 9. Fora deste escopo

- sincronizar bytes das fotos entre vários caixas;
- incluir imagens no backup JSON existente;
- acesso ao QR fora da LAN;
- armazenamento cloud;
- múltiplas fotos/galeria por produto;
- edição, recorte ou remoção automática de fundo;
- câmera ao vivo por `getUserMedia()`.

Esses itens podem ser evoluções futuras sem bloquear as etapas 6–8.

## 10. Critério de pronto

As etapas 6–8 estarão prontas quando:

- a foto já cadastrada aparecer no caixa com fallback seguro;
- o desktop gerar QR de sessão temporária;
- um celular na mesma LAN conseguir abrir a página, tirar/selecionar foto e enviar;
- o desktop receber, validar, salvar e mostrar a nova foto no formulário;
- salvar o produto persistir a referência normalmente;
- reuso/expiração/tamanho/MIME inválidos forem bloqueados;
- toda a suíte e o smoke empacotado estiverem verdes;
- Windows 7 continuar intocado.
