import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogOffer,
  createOrder,
  createPosOrderFromSale,
  isOfferAvailableOnChannel,
  transitionOrder,
  readCommerceExtension,
  writeCommerceExtension,
  addItemToOpenOrder,
  createWaiterOrder,
  createProductionTickets,
  transitionProductionTicket
} from "../packages/database/src/commerce.js";

test("catalog offer exposes one product to selected channels without duplicating the product", () => {
  const offer = createCatalogOffer({
    id: "OFFER-1",
    productId: "PROD-1",
    channels: ["POS", "WAITER", "KIOSK"],
    requiresPreparation: true,
    preparationStation: "KITCHEN"
  });

  assert.equal(offer.productId, "PROD-1");
  assert.equal(isOfferAvailableOnChannel(offer, "POS"), true);
  assert.equal(isOfferAvailableOnChannel(offer, "WHOLESALE"), false);
  assert.equal(offer.preparationStation, "KITCHEN");
});

test("new order keeps commercial, fulfillment and payment states independent", () => {
  const order = createOrder({
    id: "ORDER-1",
    number: "0001",
    channel: "WAITER",
    openedAt: "2026-10-03T12:00:00.000Z",
    items: []
  });

  assert.equal(order.status, "OPEN");
  assert.equal(order.fulfillmentStatus, "PENDING");
  assert.equal(order.paymentStatus, "UNPAID");
});

test("POS adapter maps the current sale shape to the canonical order", () => {
  const order = createPosOrderFromSale({
    sale: {
      number: "0042",
      terminalId: "CX-01",
      operatorId: "OP-1",
      customerId: "CLI-1",
      items: [{
        productCode: "100",
        productName: "Cafe",
        quantity: 2,
        unitPrice: 7.5,
        totalPrice: 15
      }],
      payments: [{ method: "PIX", amount: 15 }],
      discountPercent: 0
    },
    openedAt: "2026-10-03T12:00:00.000Z",
    finalizedAt: "2026-10-03T12:05:00.000Z"
  });

  assert.equal(order.channel, "POS");
  assert.equal(order.status, "COMPLETED");
  assert.equal(order.fulfillmentStatus, "FULFILLED");
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.items[0]?.productCode, "100");
  assert.equal(order.payments[0]?.method, "PIX");
});

test("order transition does not silently couple payment to fulfillment", () => {
  const order = createOrder({
    id: "ORDER-2",
    number: "0002",
    channel: "KIOSK",
    openedAt: "2026-10-03T12:00:00.000Z",
    items: []
  });

  const paid = transitionOrder(order, { paymentStatus: "PAID" });
  assert.equal(paid.paymentStatus, "PAID");
  assert.equal(paid.fulfillmentStatus, "PENDING");
  assert.equal(paid.status, "OPEN");
});

test("commerce extension persists beside the v1 PDV snapshot without replacing legacy fields", () => {
  const extensions = writeCommerceExtension({ existing: { enabled: true } }, {
    schemaVersion: 1,
    offers: [],
    orders: [createOrder({
      id: "ORDER-3",
      number: "0003",
      channel: "POS",
      openedAt: "2026-10-03T12:00:00.000Z"
    })]
  });

  assert.deepEqual(extensions.existing, { enabled: true });
  assert.equal(readCommerceExtension(extensions).orders[0]?.number, "0003");
});

test("waiter opens a table as one canonical open order instead of a separate comanda entity", () => {
  const order = createWaiterOrder({
    id: "ORDER-T12",
    number: "T12-001",
    tableId: "12",
    operatorId: "WAITER-7",
    openedAt: "2026-10-03T13:00:00.000Z"
  });

  assert.equal(order.channel, "WAITER");
  assert.equal(order.tableId, "12");
  assert.equal(order.operatorId, "WAITER-7");
  assert.equal(order.status, "OPEN");
});

test("waiter can append items while the table order remains open", () => {
  const order = createWaiterOrder({
    id: "ORDER-T12",
    number: "T12-001",
    tableId: "12",
    operatorId: "WAITER-7",
    openedAt: "2026-10-03T13:00:00.000Z"
  });

  const updated = addItemToOpenOrder(order, {
    id: "LINE-1",
    productCode: "BURGER",
    productName: "Burger",
    quantity: 1,
    unitPrice: 25,
    totalPrice: 25,
    requiresPreparation: true,
    preparationStation: "KITCHEN"
  });

  assert.equal(updated.items.length, 1);
  assert.equal(updated.status, "OPEN");
});

test("KDS derives one ticket per preparation station from order items", () => {
  const order = createOrder({
    id: "ORDER-4",
    number: "0004",
    channel: "WAITER",
    openedAt: "2026-10-03T13:00:00.000Z",
    items: [
      { id: "1", productCode: "BURGER", productName: "Burger", quantity: 1, unitPrice: 25, totalPrice: 25, requiresPreparation: true, preparationStation: "KITCHEN" },
      { id: "2", productCode: "JUICE", productName: "Suco", quantity: 1, unitPrice: 8, totalPrice: 8, requiresPreparation: true, preparationStation: "BAR" },
      { id: "3", productCode: "WATER", productName: "Agua", quantity: 1, unitPrice: 5, totalPrice: 5 }
    ]
  });

  const tickets = createProductionTickets(order, "2026-10-03T13:01:00.000Z");
  assert.equal(tickets.length, 2);
  assert.deepEqual(tickets.map((ticket) => ticket.station).sort(), ["BAR", "KITCHEN"]);
  assert.equal(tickets.flatMap((ticket) => ticket.items).some((item) => item.productCode === "WATER"), false);
});

test("KDS ticket lifecycle is independent from order payment", () => {
  const order = createOrder({
    id: "ORDER-5",
    number: "0005",
    channel: "KIOSK",
    openedAt: "2026-10-03T13:00:00.000Z",
    items: [{ id: "1", productCode: "BURGER", productName: "Burger", quantity: 1, unitPrice: 25, totalPrice: 25, requiresPreparation: true, preparationStation: "KITCHEN" }]
  });
  const [ticket] = createProductionTickets(order, "2026-10-03T13:01:00.000Z");
  const preparing = transitionProductionTicket(ticket!, "PREPARING", "2026-10-03T13:02:00.000Z");

  assert.equal(preparing.status, "PREPARING");
  assert.equal(order.paymentStatus, "UNPAID");
});
