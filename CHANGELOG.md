# Changelog

## 0.1.0 (unreleased)

First version.

### Added
- Border detector (pure JS, browser + Node): hexagons (pointy/flat), circles, squares; gradient,
  thin, isoluminant and partly occluded borders; outer edge, thickness and confidence.
  12/12 synthetic samples within 1.5 % of the border width (typically ~0.1 %);
  ~130 ms mean / 190 ms worst in Node, 280 ms worst in Chrome for images up to 2048 px.
  Shape fallback finds all 12 even with a wrong shape hint.
- Apply maths for `texture.scaleX/Y` + `anchorX/Y` for every `fit` mode, keeping mirroring,
  handling rotation and off-centre pivots; uses Foundry's API for the token shape and the live
  mesh for the base scale.
- Automatic fitting on token creation / image change (auto / ask / off), size-change
  re-fitting from the stored flag, prototype tokens, per-image cache.
- Token Config buttons (v12 Application V1 and v13 ApplicationV2), Token HUD button,
  keybindings, batch `fitSelected()`, manual alignment window with live canvas preview.
- Lancer and PF2e handling (autoscale), dynamic token ring skip, protection of non-uniform fits
  against Token Config re-saves, debug overlay.
- Stand-alone macro bundle (`dist/token-border-autofit-macro.js`).
- English and Russian localization.

### Manual test checklist (not yet run in Foundry)
Run with the debug overlay on; magenta and green outlines should coincide on every fitted token.
- [ ] v13, pointy-hex scene: drop an actor with bordered art → fitted, notification shows confidence.
- [ ] Same with a flat-hex scene, a square scene (square + circle borders) and a gridless scene.
- [ ] Change a token's size 1 → 2 → 3 (Lancer: change the mech frame) → border follows, no re-detection.
- [ ] Mirror the token (Token Config) → still fitted; rotate a size-2 token → still centred.
- [ ] Token Config → Appearance: *Fit border to grid* and *Adjust manually* on a placed token
      and on a prototype token; change the image in the form and press *Fit* without saving first.
- [ ] Re-save Token Config without changes on a non-uniformly fitted token → fit unchanged.
- [ ] Alignment window: drag/resize/keys, live preview on the canvas, Cancel reverts, Apply saves.
- [ ] Mode *Ask*: prompt appears after placing a token; *Apply* and *Adjust…* work.
- [ ] Low-confidence image (no border) → nothing applied silently, prompt offers manual alignment.
- [ ] Image from another host without CORS → error prompt offers manual alignment.
- [ ] PF2e: small creature with autoscale → fit sticks after reload.
- [ ] Dynamic ring token → skipped with warning (and fitted when the setting says so).
- [ ] Player (owner, not GM) can fit their own token; cannot fit others'.
- [ ] Stand-alone macro without the module enabled; Shift opens the dialog.
- [ ] v12 and v14 smoke test: Token Config button renders, fitting works, debug outlines coincide.
