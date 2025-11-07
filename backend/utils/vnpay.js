// backend/utils/vnpay.js
import querystring from 'qs';
import crypto from 'crypto';
import dateFormat from 'dateformat';

function sortObject(obj) {
  let sorted = {};
  let keys = Object.keys(obj).sort();
  for (let key of keys) {
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
  let vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_Amount: amount * 100,
    vnp_CreateDate: dateFormat(new Date(), 'yyyymmddHHmmss'),
    vnp_CurrCode: 'VND',
    vnp_IpAddr:
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_TxnRef: orderId.toString(),
  };

  vnp_Params = sortObject(vnp_Params);

  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
  const vnp_SecureHash = hmac
    .update(new Buffer(signData, 'utf-8'))
    .digest('hex');

  vnp_Params.vnp_SecureHash = vnp_SecureHash;
  return `${process.env.VNPAY_API_URL}?${querystring.stringify(vnp_Params, {
    encode: false,
  })}`;
};

export const verifyVNPayResponse = (query) => {
  let vnp_Params = { ...query };
  let secureHash = vnp_Params.vnp_SecureHash;

  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  vnp_Params = sortObject(vnp_Params);
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET);
  const checkSign = hmac.update(new Buffer(signData, 'utf-8')).digest('hex');

  return {
    isValid: secureHash === checkSign,
    isSuccess: secureHash === checkSign && vnp_Params.vnp_ResponseCode === '00',
    responseCode: vnp_Params.vnp_ResponseCode || '99',
    amount: vnp_Params.vnp_Amount ? Number(vnp_Params.vnp_Amount) / 100 : 0,
    transactionNo: vnp_Params.vnp_TransactionNo,
  };
};

export const checkIfNewVNPayTransaction = async (orderModel, transactionNo) => {
  const existing = await orderModel.findOne({
    'paymentResult.transactionNo': transactionNo,
  });
  return !existing;
};
