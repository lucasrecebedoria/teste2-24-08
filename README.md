# Move Buss • Registro de Caixas

Site estático pronto para GitHub Pages usando Tailwind (CDN) + Firebase (Auth, Firestore e Storage).

## Como publicar

1. Faça o upload destes arquivos para um repositório no GitHub.
2. Ative o **GitHub Pages** com a branch `main` e a pasta raiz (`/`).
3. Pronto: a aplicação carrega direto do CDN e conecta à Firebase com sua configuração.

## Login por matrícula

- O login usa **matrícula + senha** mapeando para um email fictício: `MATRICULA@movebuss.local` na Firebase.
- Admins pré-cadastrados: 4144, 70029 e 6266 (a badge fica dourada).

## Funcionalidades

- Cadastro e login; sessão persiste até o usuário deslogar.
- Abertura/fechamento de caixa (apenas um por matrícula).
- Lançamentos com cálculo automático (bordos × 5), prefixo fixo `55` + 3 dígitos, data BR, e matrículas.
- Recibo **térmico** automático (80mm × 144mm) via jsPDF a cada lançamento.
- Relatório **A4** ao fechar o caixa, com totais e sangrias; download automático e upload para Firebase Storage.
- Sangria disponível somente com **autorização de admin** (matrícula + senha do admin).
- Design dark metálico com Tailwind; menu lateral; badges verdes ou douradas.

## Pastas

- `index.html` – UI e layout.
- `app.js` – Lógica, Firebase e geração de PDFs.
- `assets/logo.png` – Logotipo exibido no cabeçalho.
