import querystring from 'qs';
import crypto from 'crypto';
import dateFormat from 'dateformat';

const USD_TO_VND_RATE = 30000; // 1 USD = 30,000 VND

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
      sorted[key] = obj[key];
    }
  }
  return sorted;
}

export const createVNPayPaymentURL = (
  req,
  amount,
  orderId,
  orderInfo = 'Thanh toan don hang ProShop'
) => {
  // Convert USD to VND: amount is in USD, multiply by rate to get VND
  const amountInVND = Math.round(Number.parseFloat(amount) * USD_TO_VND_RATE);

  // VNPay expects amount in cents (multiply by 100), must be integer
  const vnpAmount = Math.floor(amountInVND * 100);

  console.log(
    '[v0] Payment URL - USD Amount:',
    amount,
    '-> VND:',
    amountInVND,
    '-> VNPay format:',
    vnpAmount
  );

  const createDate = dateFormat(new Date(), 'yyyymmddHHmmss');

  let vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_Amount: vnpAmount, // Must be integer (cents)
    vnp_CreateDate: createDate, // Exact format: yyyymmddHHmmss
    vnp_CurrCode: 'VND',
    vnp_IpAddr:
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: encodeURIComponent(orderInfo), // Properly encode special characters
    vnp_OrderType: 'other',
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TxnRef: orderId.toString(),
  };

  vnp_Params = sortObject(vnp_Params);

  const signData = querystring.stringify(vnp_Params, { encode: false });
  console.log('[v0] Sign data:', signData);

  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
  const vnp_SecureHash = hmac
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  vnp_Params.vnp_SecureHash = vnp_SecureHash;

  const paymentUrl = `${process.env.VNPAY_API_URL}?${querystring.stringify(
    vnp_Params,
    {
      encode: false,
    }
  )}`;

  console.log('[v0] Final VNPay URL generated successfully');
  return paymentUrl;
};

export const verifyVNPayResponse = (query) => {
  console.log('[v0] Verify response - All params:', query);

  let vnp_Params = { ...query };
  const secureHash = vnp_Params.vnp_SecureHash;

  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  vnp_Params = sortObject(vnp_Params);
  const signData = querystring.stringify(vnp_Params, { encode: false });

  console.log('[v0] Verify sign data:', signData);

  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
  const checkSign = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  console.log('[v0] Expected hash:', secureHash);
  console.log('[v0] Calculated hash:', checkSign);
  console.log('[v0] Hash match:', secureHash === checkSign);

  const amountInCents = vnp_Params.vnp_Amount
    ? Number(vnp_Params.vnp_Amount)
    : 0;
  const amountInVND = amountInCents / 100;
  const amountInUSD = amountInVND / USD_TO_VND_RATE;

  console.log(
    '[v0] Amount conversion - Cents:',
    amountInCents,
    '-> VND:',
    amountInVND,
    '-> USD:',
    amountInUSD
  );

  return {
    isValid: secureHash === checkSign,
    isSuccess: secureHash === checkSign && vnp_Params.vnp_ResponseCode === '00',
    responseCode: vnp_Params.vnp_ResponseCode || '99',
    amount: Number.parseFloat(amountInUSD.toFixed(2)), // Return USD amount for comparison
    transactionNo: vnp_Params.vnp_TransactionNo,
  };
};

export const checkIfNewVNPayTransaction = async (orderModel, transactionNo) => {
  const existing = await orderModel.findOne({
    'paymentResult.transactionNo': transactionNo,
  });
  return !existing;
};
