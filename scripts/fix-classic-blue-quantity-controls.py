from pathlib import Path

old = '''<span className="num">{item.quantity.toFixed(item.unitLabel === "KG" ? 3 : 0)} {item.unitLabel}</span>'''
new = '''<span className="num classic-blue-quantity-cell">
                  {item.source === "catalog" && item.unitLabel === "UN" ? <button type="button" className="classic-blue-quantity-button" aria-label="Diminuir quantidade" title="Diminuir quantidade" onClick={() => adjustSaleItemQuantity(item.id, -1)}>−</button> : null}
                  <span>{item.quantity.toFixed(item.unitLabel === "KG" ? 3 : 0)} {item.unitLabel}</span>
                  {item.source === "catalog" && item.unitLabel === "UN" ? <button type="button" className="classic-blue-quantity-button" aria-label="Aumentar quantidade" title="Aumentar quantidade" onClick={() => adjustSaleItemQuantity(item.id, 1)}>+</button> : null}
                </span>'''

css_addition = '''
.classic-blue-quantity-cell {
  justify-content: center !important;
  gap: 3px;
  padding: 0 2px !important;
}
.classic-blue-quantity-cell > span { min-width: 26px; justify-content: center; text-align: center; }
.classic-blue-quantity-button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #777;
  border-top-color: #fff;
  border-left-color: #fff;
  border-radius: 0;
  background: #ece9d8;
  color: #003f9b;
  font: 700 13px/18px Tahoma, sans-serif;
  cursor: default;
}
.classic-blue-quantity-button:active { border-color: #fff #666 #666 #fff; }
'''

for edition in ("windows-10", "windows-7"):
    app = Path(edition) / "apps/pdv-demo/src/PdvDemoApp.tsx"
    text = app.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"quantity cell marker not found in {edition}")
    app.write_text(text.replace(old, new, 1), encoding="utf-8")

    css = Path(edition) / "apps/pdv-demo/src/pdv-classic-blue.css"
    css_text = css.read_text(encoding="utf-8")
    if ".classic-blue-quantity-button" not in css_text:
        css.write_text(css_text + css_addition, encoding="utf-8")
