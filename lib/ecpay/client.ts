import "server-only";
import { createHash } from "node:crypto";
import type { EcpayOrderInput } from "@/lib/ecpay/types";

function getCredentials() {
  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;

  if (!merchantId || !hashKey || !hashIv) {
    throw new Error("ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV 尚未設定");
  }

  return { merchantId, hashKey, hashIv };
}

export function getEcpayActionUrl(): string {
  const mode = process.env.ECPAY_MODE ?? "test";
  return mode === "production"
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
}

// ECPay's CheckMacValue algorithm: sort params (excluding CheckMacValue) by key
// ordinal ascending, bookend with HashKey/HashIV, URL-encode the whole string the way
// .NET's UrlEncode does (which differs from encodeURIComponent for a handful of
// characters), lowercase it, then SHA256 + uppercase hex. This exact
// encode-then-selectively-un-encode sequence is required to match ECPay's server-side
// computation byte-for-byte — deviating on any character breaks verification.
function dotNetUrlEncode(raw: string): string {
  const encoded = encodeURIComponent(raw).toLowerCase();
  return encoded
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%20/g, "+");
}

export function computeCheckMacValue(params: Record<string, string | number>): string {
  const { hashKey, hashIv } = getCredentials();

  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const raw =
    `HashKey=${hashKey}&` +
    sortedKeys.map((k) => `${k}=${params[k]}`).join("&") +
    `&HashIV=${hashIv}`;

  const encoded = dotNetUrlEncode(raw);
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyCheckMacValue(params: Record<string, string>): boolean {
  const { CheckMacValue, ...rest } = params;
  if (!CheckMacValue) return false;
  return computeCheckMacValue(rest) === CheckMacValue.toUpperCase();
}

function formatTradeDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// MerchantTradeNo must be alphanumeric and <= 20 chars, so a raw UUID (36 chars, has
// dashes) doesn't fit — this derives a stable, order-independent one from it.
export function buildMerchantTradeNo(registrationId: string): string {
  return `R${registrationId.replace(/-/g, "")}`.slice(0, 20);
}

export function buildAioCheckoutParams(order: EcpayOrderInput) {
  const { merchantId } = getCredentials();

  const baseParams: Record<string, string | number> = {
    MerchantID: merchantId,
    MerchantTradeNo: order.merchantTradeNo,
    MerchantTradeDate: formatTradeDate(new Date()),
    PaymentType: "aio",
    TotalAmount: Math.round(order.totalAmount),
    TradeDesc: order.tradeDesc,
    ItemName: order.itemName,
    ReturnURL: order.returnUrl,
    ChoosePayment: "ALL",
    EncryptType: 1,
    ...(order.clientBackUrl ? { ClientBackURL: order.clientBackUrl } : {}),
  };

  const CheckMacValue = computeCheckMacValue(baseParams);

  return { ...baseParams, CheckMacValue };
}
