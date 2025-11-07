import crypto from 'crypto';

const { VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_API_URL } = process.env;

/**
 * Creates a VNPay payment URL
 * @param {Object} params - Payment parameters
 * @returns {string} VNPay payment URL
 */
export function createVNPayPaymentURL(params) {
  const { amount, orderId, orderInfo, returnUrl, ipAddress } = params;

  const vnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNPAY_TMN_CODE,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: amount * 100, // Amount in centimeters (VND is multiplied by 100)
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddress,
    vnp_CreateDate: getDateTime(),
  };

  // Sort parameters
  const sortedParams = {};
  Object.keys(vnpParams)
    .sort()
    .forEach((key) => {
      sortedParams[key] = vnpParams[key];
    });

  // Create signature
  const signData = Object.keys(sortedParams)
    .map((key) => `${key}=${encodeURIComponent(sortedParams[key])}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  const paymentUrl = `${VNPAY_API_URL}?${signData}&vnp_SecureHash=${signed}`;
  return paymentUrl;
}

/**
 * Verifies a VNPay payment response
 * @param {Object} vnpParams - VNPay response parameters
 * @returns {Object} Verification result
 */
export function verifyVNPayResponse(vnpParams) {
  const secureHash = vnpParams.vnp_SecureHash;

  // Remove secure hash and vnp_SecureHashType from params
  delete vnpParams.vnp_SecureHash;
  delete vnpParams.vnp_SecureHashType;

  // Sort and create signature
  const sortedParams = {};
  Object.keys(vnpParams)
    .sort()
    .forEach((key) => {
      sortedParams[key] = vnpParams[key];
    });

  const signData = Object.keys(sortedParams)
    .map((key) => `${key}=${encodeURIComponent(sortedParams[key])}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
  const computedHash = hmac
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const isValid = computedHash === secureHash;
  const isSuccessful = isValid && vnpParams.vnp_ResponseCode === '00';

  return {
    isValid,
    isSuccessful,
    transactionNo: vnpParams.vnp_TransactionNo,
    amount: Number.parseInt(vnpParams.vnp_Amount) / 100,
    paymentTime: vnpParams.vnp_PayDate,
  };
}

/**
 * Gets current datetime in VNPay format (YYYYMMDDHHmmss)
 * @returns {string} Formatted datetime
 */
function getDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Checks if a VNPay transaction is new
 * @param {Model} orderModel - Order model
 * @param {string} transactionNo - VNPay transaction number
 * @returns {Promise<boolean>} True if transaction is new
 */
export async function checkIfNewVNPayTransaction(orderModel, transactionNo) {
  const existingOrder = await orderModel.findOne({
    'paymentResult.transactionNo': transactionNo,
  });
  return !existingOrder;
}
