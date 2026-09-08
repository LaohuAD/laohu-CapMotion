# Bundled caption fonts

`scripts/setup-caption-fonts.mjs` downloads pinned font binaries and verifies
their SHA-256 digests before Rust compilation. Source Han Sans and Serif use
static 400/500/700 faces: the renderer's font matcher requires an exact weight,
so loading only the variable font can silently select a system CJK fallback.
LXGW WenKai likewise uses its real 300/400/500 static faces so the editor never
offers a weight that silently renders as regular. Generated `.otf`/`.ttf` files
are ignored by Git; their licenses remain tracked here.

- Source Han Sans / Source Han Serif: SIL Open Font License 1.1
- LXGW WenKai: SIL Open Font License 1.1
