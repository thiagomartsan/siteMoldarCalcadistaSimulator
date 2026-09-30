# Moldar V3

Versão de refinamento estrutural e visual do Moldar.

## Abrir localmente

A forma mais simples é abrir `index.html` diretamente. Os links internos apontam explicitamente para os arquivos `index.html` das subpastas para evitar a listagem de diretório vista na V2.

Para testar em servidor local:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000/`.

## Estrutura

- `index.html`: home curta e visual
- `simular/index.html`: simulador funcional em 5 passos
- `metodologia/index.html`: explicação curta da lógica e limitações
- `diagnostico/index.html`: serviço de aprofundamento
- `assets/css/styles.css`: estilos gerais
- `assets/js/main.js`: interações da home e páginas institucionais
- `assets/js/simulator.js`: regras e interface do simulador
- `assets/svg/`: elementos vetoriais provisórios ligados ao calçado

## Antes de publicar

Substituir:
- `SEU-DOMINIO.com`
- `55SEUNUMERO`

Criar posteriormente:
- logotipo definitivo
- favicon
- og-image
- imagens/ilustrações finais

## Observação

Os dados dos exemplos são demonstrativos. O simulador não salva dados nem cria conta de usuário.
