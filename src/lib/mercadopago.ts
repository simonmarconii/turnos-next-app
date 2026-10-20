import { MercadoPagoConfig } from "mercadopago";

if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Missing MERCADO_PAGO_ACCESS_TOKEN environment variable");
}

const mercadoPagoClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

export default mercadoPagoClient;