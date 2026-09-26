from pathlib import Path

CASHIER = r'''      {route === "/caixa" ? <section className="classic-blue-cashier" data-classic-blue="cashier">
        <div className="classic-blue-operation-title">VENDA (PDV)</div>
        <header className="classic-blue-sale-head">
          <label className="classic-blue-field">
            <span>Cliente:</span>
            <select id="classic-blue-customer" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
              {registeredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="classic-blue-field classic-blue-code-field">
            <span>Código:</span>
            <input ref={checkoutSearchRef} autoFocus value={entryValue} onChange={(event) => setEntryValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" ? handleEntrySubmit() : null} placeholder="Código, barras ou nome exato" />
            <button type="button" className="classic-blue-command-button" onClick={handleEntrySubmit}>Incluir</button>
          </label>
          <div className="classic-blue-sale-meta">
            <span>Venda:</span><strong>{sale?.number ?? "------"}</strong>
            <span>Operador:</span><strong>{activeOperator.name}</strong>
            <span>Caixa:</span><strong>{terminalConfig.terminalId}</strong>
            <span>Status:</span><strong>{cashStatus}</strong>
          </div>
        </header>

        <div className="classic-blue-workspace">
          <section className="classic-blue-items classic-blue-items-table" aria-label="Itens da venda">
            <div className="classic-blue-section-title">ITENS DA VENDA</div>
            <div className="classic-blue-table-head"><span>Código</span><span>Descrição do Produto</span><span>Qtde.</span><span>Unitário</span><span>Total</span></div>
            <div className="classic-blue-table-body">
              {(sale?.items ?? []).map((item) => <div className="classic-blue-item-row" key={item.id}>
                <span>{item.productCode}</span>
                <span title={item.productName}>{item.productName}</span>
                <span className="num">{item.quantity.toFixed(item.unitLabel === "KG" ? 3 : 0)} {item.unitLabel}</span>
                <span className="num">{formatCurrency(item.unitPrice)}</span>
                <span className="num">{formatCurrency(item.totalPrice)}</span>
              </div>)}
              {sale?.items.length ? null : <div className="classic-blue-empty-row">{sale ? "Venda aberta. Digite ou bipe um produto." : "Pressione F2 para iniciar uma nova venda."}</div>}
            </div>
            <div className="classic-blue-payment-panel">
              <div className="classic-blue-payment-editor">
                {(sale?.payments ?? []).map((payment, index) => <div className="classic-blue-payment-line" key={`${payment.method}-${index}`}>
                  <select value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value as PaymentMethod })} disabled={!sale}>{activePaymentOptions.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}</select>
                  <input type="number" min="0" step="0.01" value={String(payment.amount)} onChange={(event) => updatePayment(index, { amount: Number(event.target.value) || 0 })} disabled={!sale} />
                  <button type="button" onClick={() => fillPaymentRemaining(index)} disabled={!sale}>Restante</button>
                </div>)}
                <button type="button" className="classic-blue-mini-button" onClick={() => addPayment()} disabled={!sale}>+ Forma</button>
              </div>
              <div className="classic-blue-payment-quick">{paymentQuickMethods.map((method) => <button type="button" key={method} onClick={() => applyQuickPayment(method)} disabled={!sale}>{method}</button>)}</div>
              <label className="classic-blue-discount"><span>Desconto %</span><input id="classic-blue-discount" value={String(sale?.discountPercent ?? 0)} onChange={(event) => updateDiscountPercent(Number(event.target.value) || 0)} disabled={!sale} /></label>
            </div>
          </section>

          <aside className="classic-blue-summary">
            <div className="classic-blue-product-preview">
              <h3>{(sale?.items ?? []).slice(-1)[0]?.productName ?? "Produto"}</h3>
              <div className="classic-blue-product-placeholder">{((sale?.items ?? []).slice(-1)[0]?.productName ?? "PDV").slice(0, 2).toUpperCase()}</div>
              <small>{(sale?.items ?? []).slice(-1)[0] ? `Último item: ${(sale?.items ?? []).slice(-1)[0].productCode}` : "Aguardando leitura de produto"}</small>
            </div>
            <div className="classic-blue-total-card total"><span>TOTAL</span><strong>{formatCurrency(netTotal)}</strong></div>
            <div className="classic-blue-total-card received"><span>RECEBIDO</span><strong>{formatCurrency(paidTotal)}</strong></div>
            <div className="classic-blue-total-card change"><span>TROCO</span><strong>{formatCurrency(change)}</strong></div>
            <div className="classic-blue-event"><strong>{itemCount.toFixed(3)} item(ns)</strong><br />Subtotal {formatCurrency(grossTotal)} · Desconto {formatCurrency(discountValue)} · Falta {formatCurrency(remainingTotal)}<br />{lastEvent}</div>
          </aside>
        </div>

        <footer className="classic-blue-function-bar" aria-label="Teclas de função">
          <button type="button" className="classic-blue-function-key" onClick={() => startNewSale()}><b>F2</b><span>Nova venda</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => checkoutSearchRef.current?.focus()}><b>F3</b><span>Produto</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => document.querySelector<HTMLSelectElement>("#classic-blue-customer")?.focus()}><b>F4</b><span>Cliente</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => document.querySelector<HTMLInputElement>("#classic-blue-discount")?.focus()} disabled={!sale}><b>F5</b><span>Desconto</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => applyQuickPayment("A VISTA")} disabled={!sale}><b>F6</b><span>Pagamento</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => document.querySelector<HTMLSelectElement>(".classic-blue-payment-line select")?.focus()} disabled={!sale}><b>F7</b><span>Recebimentos</span></button>
          <button type="button" className="classic-blue-function-key finish" onClick={finalizeSale} disabled={!sale}><b>F8</b><span>Finalizar</span></button>
          <button type="button" className="classic-blue-function-key danger" onClick={removeLastItem} disabled={!sale || sale.items.length === 0}><b>Del</b><span>Cancelar item</span></button>
          <button type="button" className="classic-blue-function-key" onClick={() => { window.location.hash = "/financeiro"; }}><b>F9</b><span>Sangria / Caixa</span></button>
          <button type="button" className="classic-blue-function-key finish" onClick={finalizeSale} disabled={!sale}><b>F12</b><span>Finalizar venda</span></button>
        </footer>
      </section> : null}

'''

for edition in ("windows-10", "windows-7"):
    path = Path(edition) / "apps/pdv-demo/src/PdvDemoApp.tsx"
    text = path.read_text(encoding="utf-8-sig")
    start_marker = '      {route === "/caixa" ? <section style={styles.cashierSurface}>'
    product_marker = '      {route === "/produtos" ?'
    start = text.find(start_marker)
    end = text.find(product_marker, start)
    if start < 0 or end < 0:
        raise SystemExit(f"cashier block markers not found in {edition}")
    text = text[:start] + CASHIER + text[end:]
    old = 'if (event.key === "F8") { event.preventDefault(); finalizeSale(); } }'
    new = 'if (event.key === "F8") { event.preventDefault(); finalizeSale(); } if (event.key === "F12") { event.preventDefault(); finalizeSale(); } }'
    if old not in text:
        raise SystemExit(f"F8 shortcut marker not found in {edition}")
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")

for edition in ("windows-10", "windows-7"):
    css = Path(edition) / "apps/pdv-demo/src/pdv-classic-blue.css"
    text = css.read_text(encoding="utf-8")
    alias = "\n.classic-blue-items-table { min-width: 0; }\n"
    if ".classic-blue-items-table" not in text:
        css.write_text(text + alias, encoding="utf-8")
