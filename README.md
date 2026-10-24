# Meus Gastos

App web (PWA) para controle de **gastos fixos** e **gastos variáveis**, feito em HTML, CSS e JavaScript puro — sem dependências e sem servidor.

## Funcionalidades

- **Gastos fixos** (aluguel, internet, assinaturas…): cadastrados uma vez, aparecem todo mês. Marque como pago mês a mês, com aviso de vencimento próximo ou atrasado.
- **Gastos variáveis** (mercado, transporte, lazer…): lançamento rápido pelo botão `+`, agrupados por dia e com filtro por categoria.
- **Resumo do mês**: renda, total de fixos (e quanto já foi pago), variáveis e saldo.
- **Gastos por categoria** com barras de proporção.
- **Navegação entre meses** com histórico preservado (encerrar um fixo não apaga os meses anteriores).
- **Categorias** personalizáveis.
- **Backup**: exportar/importar JSON e exportar o mês em CSV (abre no Excel).
- Funciona **offline** e pode ser **instalado** no celular ("Adicionar à tela inicial").
- Tema claro/escuro automático.

Os dados ficam salvos no `localStorage` do navegador, apenas no aparelho em uso.

## Como rodar

Basta servir a pasta com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 8000
```

e abrir <http://localhost:8000>. Para usar no celular, publique a pasta em um serviço como GitHub Pages, Netlify ou Vercel.

## Instalar no iPhone

1. Publique pelo GitHub Pages (Settings → Pages → branch `master`, pasta `/ (root)`).
2. Abra **https://tomslima22.github.io/App/** no **Safari**.
3. Toque em **Compartilhar** → **Adicionar à Tela de Início**.

Os dados ficam salvos só no iPhone, dentro do app instalado (são separados dos dados de uma aba comum do Safari).
O backup em Ajustes abre a folha de compartilhamento: escolha "Salvar em Arquivos".

## Estrutura

| Arquivo         | Conteúdo                                   |
|-----------------|--------------------------------------------|
| `index.html`    | Estrutura da página e formulários          |
| `style.css`     | Estilos (responsivo, claro/escuro)         |
| `app.js`        | Lógica, armazenamento e renderização       |
| `sw.js`         | Service worker para funcionar offline      |
| `manifest.json` | Configuração para instalar como app        |
