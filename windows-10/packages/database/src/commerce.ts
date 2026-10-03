export type CommerceChannel = "POS" | "WAITER" | "KIOSK" | "TABLE_QR" | "DELIVERY" | "WHOLESALE";
export type CommerceOrderStatus = "OPEN" | "CONFIRMED" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED";
export type CommerceFulfillmentStatus = "PENDING" | "PREPARING" | "READY" | "FULFILLED" | "CANCELLED";
export type CommercePaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "CANCELLED";

export interface CatalogOffer {
  id: string;
  productId: string;
  channels: CommerceChannel[];
  active: boolean;
  requiresPreparation: boolean;
  preparationStation?: string;
  priceOverride?: number;
}

export interface CreateCatalogOfferInput {
  id: string;
  productId: string;
  channels: CommerceChannel[];
  active?: boolean;
  requiresPreparation?: boolean;
  preparationStation?: string;
  priceOverride?: number;
}

export interface CommerceOrderItem {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  offerId?: string;
  requiresPreparation?: boolean;
  preparationStation?: string;
  notes?: string;
}

export interface CommerceOrderPayment {
  method: string;
  amount: number;
}

export interface CommerceOrder {
  id: string;
  number: string;
  channel: CommerceChannel;
  status: CommerceOrderStatus;
  fulfillmentStatus: CommerceFulfillmentStatus;
  paymentStatus: CommercePaymentStatus;
  openedAt: string;
  confirmedAt?: string;
  finalizedAt?: string;
  customerId?: string;
  tableId?: string;
  operatorId?: string;
  terminalId?: string;
  priceContext?: string;
  items: CommerceOrderItem[];
  payments: CommerceOrderPayment[];
  discountPercent: number;
}

export interface CreateCommerceOrderInput {
  id: string;
  number: string;
  channel: CommerceChannel;
  openedAt: string;
  customerId?: string;
  tableId?: string;
  operatorId?: string;
  terminalId?: string;
  priceContext?: string;
  items?: CommerceOrderItem[];
  payments?: CommerceOrderPayment[];
  discountPercent?: number;
}

export interface LegacyPosSale {
  number: string;
  terminalId?: string;
  operatorId?: string;
  customerId?: string;
  items: Array<{
    productId?: string;
    productCode: string;
    productName: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  payments: CommerceOrderPayment[];
  discountPercent: number;
}

export function createCatalogOffer(input: CreateCatalogOfferInput): CatalogOffer {
  const id = input.id.trim();
  const productId = input.productId.trim();
  if (!id || !productId) throw new Error("Oferta e produto sao obrigatorios.");

  const channels = [...new Set(input.channels)];
  if (!channels.length) throw new Error("Selecione ao menos um canal para a oferta.");

  const requiresPreparation = input.requiresPreparation ?? false;
  const preparationStation = input.preparationStation?.trim() || undefined;
  if (requiresPreparation && !preparationStation) {
    throw new Error("Informe a estacao de preparo para itens que exigem producao.");
  }

  return {
    id,
    productId,
    channels,
    active: input.active ?? true,
    requiresPreparation,
    preparationStation,
    priceOverride: input.priceOverride
  };
}

export function isOfferAvailableOnChannel(offer: CatalogOffer, channel: CommerceChannel): boolean {
  return offer.active && offer.channels.includes(channel);
}

export function createOrder(input: CreateCommerceOrderInput): CommerceOrder {
  const id = input.id.trim();
  const number = input.number.trim();
  if (!id || !number) throw new Error("Pedido precisa de identificador e numero.");

  return {
    id,
    number,
    channel: input.channel,
    status: "OPEN",
    fulfillmentStatus: "PENDING",
    paymentStatus: "UNPAID",
    openedAt: input.openedAt,
    customerId: input.customerId,
    tableId: input.tableId,
    operatorId: input.operatorId,
    terminalId: input.terminalId,
    priceContext: input.priceContext,
    items: input.items ?? [],
    payments: input.payments ?? [],
    discountPercent: input.discountPercent ?? 0
  };
}

export function transitionOrder(
  order: CommerceOrder,
  patch: Partial<Pick<CommerceOrder, "status" | "fulfillmentStatus" | "paymentStatus" | "confirmedAt" | "finalizedAt">>
): CommerceOrder {
  return { ...order, ...patch };
}

export function createPosOrderFromSale(input: {
  sale: LegacyPosSale;
  openedAt: string;
  finalizedAt?: string;
}): CommerceOrder {
  const finalized = Boolean(input.finalizedAt);
  const items = input.sale.items.map((item, index) => {
    const unitPrice = item.unitPrice ?? (item.quantity > 0 && item.totalPrice !== undefined ? item.totalPrice / item.quantity : 0);
    const totalPrice = item.totalPrice ?? unitPrice * item.quantity;
    return {
      id: `${input.sale.number}-${index + 1}`,
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: roundCurrency(unitPrice),
      totalPrice: roundCurrency(totalPrice)
    };
  });

  return {
    ...createOrder({
      id: `POS-${input.sale.number}`,
      number: input.sale.number,
      channel: "POS",
      openedAt: input.openedAt,
      customerId: input.sale.customerId,
      operatorId: input.sale.operatorId,
      terminalId: input.sale.terminalId,
      items,
      payments: input.sale.payments,
      discountPercent: input.sale.discountPercent
    }),
    status: finalized ? "COMPLETED" : "OPEN",
    fulfillmentStatus: finalized ? "FULFILLED" : "PENDING",
    paymentStatus: finalized ? "PAID" : "UNPAID",
    finalizedAt: input.finalizedAt
  };
}

export interface CommerceExtensionState {
  schemaVersion: 1;
  offers: CatalogOffer[];
  orders: CommerceOrder[];
}

export const EMPTY_COMMERCE_EXTENSION: CommerceExtensionState = {
  schemaVersion: 1,
  offers: [],
  orders: []
};

export function readCommerceExtension(extensions?: Record<string, unknown>): CommerceExtensionState {
  const candidate = extensions?.commerce;
  if (!candidate || typeof candidate !== "object") return EMPTY_COMMERCE_EXTENSION;
  const value = candidate as Partial<CommerceExtensionState>;
  return {
    schemaVersion: 1,
    offers: Array.isArray(value.offers) ? value.offers : [],
    orders: Array.isArray(value.orders) ? value.orders : []
  };
}

export function writeCommerceExtension(
  extensions: Record<string, unknown> | undefined,
  commerce: CommerceExtensionState
): Record<string, unknown> {
  return { ...(extensions ?? {}), commerce };
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}
