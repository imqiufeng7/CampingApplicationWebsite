import { describe, it, expect } from "vitest";
import { ecpayPaymentTypeLabel, paymentMethodDisplay } from "@/lib/ecpay/paymentType";

describe("ecpayPaymentTypeLabel", () => {
  it("maps ECPay's method prefix regardless of channel", () => {
    expect(ecpayPaymentTypeLabel("Credit_CreditCard")).toBe("信用卡");
    expect(ecpayPaymentTypeLabel("ATM_TAISHIN")).toBe("ATM 虛擬帳號");
    expect(ecpayPaymentTypeLabel("ATM_LAND")).toBe("ATM 虛擬帳號");
    expect(ecpayPaymentTypeLabel("CVS_CVS")).toBe("超商代碼");
    expect(ecpayPaymentTypeLabel("BARCODE_BARCODE")).toBe("超商條碼");
    expect(ecpayPaymentTypeLabel("WebATM_TAISHIN")).toBe("網路 ATM");
  });

  it("falls back to the raw value for an unknown method, and null for nothing", () => {
    expect(ecpayPaymentTypeLabel("NewThing_X")).toBe("NewThing_X");
    expect(ecpayPaymentTypeLabel(null)).toBeNull();
    expect(ecpayPaymentTypeLabel("")).toBeNull();
  });
});

describe("paymentMethodDisplay", () => {
  it("prefers the actual settled ECPay method", () => {
    expect(paymentMethodDisplay("online", "CVS_CVS")).toBe("超商代碼（綠界）");
  });

  it("falls back to the configured channel before payment", () => {
    expect(paymentMethodDisplay("online", null)).toBe("綠界線上付款");
    expect(paymentMethodDisplay("manual", null)).toBe("人工轉帳");
    expect(paymentMethodDisplay(null, null)).toBe("-");
  });
});
