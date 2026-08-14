export interface EcpayOrderInput {
  merchantTradeNo: string;
  totalAmount: number;
  tradeDesc: string;
  itemName: string;
  returnUrl: string;
  clientBackUrl?: string;
}

export interface EcpayCallbackPayload {
  MerchantID: string;
  MerchantTradeNo: string;
  RtnCode: string;
  RtnMsg: string;
  TradeNo: string;
  TradeAmt: string;
  PaymentDate: string;
  PaymentType: string;
  CheckMacValue: string;
  [key: string]: string;
}
