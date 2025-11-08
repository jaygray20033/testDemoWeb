import crypto from 'crypto';

// Constants
const USD_TO_VND_RATE = 24000;
const VNPAY_TIMEOUT = 15; // minutes
const VNPAY_VERSION = '2.1.0';

/**
 * Format date to VNPAY format (yyyymmddHHmmss)
 */
function formatVNPayDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Sort object keys and remove null/empty values
 */
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

/**
 * Calculate HMAC SHA512 checksum
 */
function calculateChecksum(signData, hashSecret) {
  const hmac = crypto.createHmac('sha512', hashSecret);
  return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
}

/**
 * Create VNPAY payment URL
 */
export const createVNPayPaymentURL = (
  req,
  amount,
  orderId,
  orderInfo = 'Thanh toan don hang'
) => {
  // Validate inputs
  if (!amount || amount <= 0) {
    throw new Error('Số tiền không hợp lệ');
  }
  if (!orderId) {
    throw new Error('ID đơn hàng không hợp lệ');
  }
  if (
    !process.env.VNPAY_TMN_CODE ||
    !process.env.VNPAY_HASH_SECRET ||
    !process.env.VNPAY_API_URL
  ) {
    throw new Error('VNPAY environment variables not configured');
  }

  const amountInVND = Math.round(Number.parseFloat(amount) * USD_TO_VND_RATE);
  const vnpayAmount = amountInVND * 100;

  // Get IP address
  let ipAddr = req.headers['x-forwarded-for'];
  if (ipAddr) {
    ipAddr = ipAddr.split(',')[0].trim();
  } else {
    ipAddr =
      req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  }

  // Clean IP (handle IPv6)
  if (ipAddr.includes('::ffff:')) {
    ipAddr = ipAddr.replace('::ffff:', '');
  }
  if (ipAddr === '::1') {
    ipAddr = '127.0.0.1';
  }

  const now = new Date();
  const createDate = formatVNPayDate(now);
  const expireTime = new Date(now.getTime() + VNPAY_TIMEOUT * 60 * 1000);
  const expireDate = formatVNPayDate(expireTime);

  // Build parameters in exact VNPAY order
  let vnp_Params = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: 'pay',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId.toString(),
    vnp_OrderInfo: `${orderInfo}`,
    vnp_OrderType: 'billpayment',
    vnp_Amount: vnpayAmount.toString(), // Use vnpayAmount (x100)
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  // Sort parameters
  vnp_Params = sortObject(vnp_Params);

  // Create sign string
  const signData = new URLSearchParams(vnp_Params).toString();

  // Calculate checksum
  const vnp_SecureHash = calculateChecksum(
    signData,
    process.env.VNPAY_HASH_SECRET
  );

  // Add checksum to params
  vnp_Params.vnp_SecureHash = vnp_SecureHash;

  // Build final URL
  const paymentUrl = `${process.env.VNPAY_API_URL}?${new URLSearchParams(
    vnp_Params
  ).toString()}`;

  console.log('[v0] VNPAY Payment URL generated:');
  console.log('[v0] Order ID:', orderId);
  console.log(
    '[v0] Amount USD:',
    amount,
    '=> VND:',
    amountInVND,
    '=> x100:',
    vnpayAmount
  );
  console.log('[v0] IP Address:', ipAddr);
  console.log('[v0] Create Date:', createDate);
  console.log('[v0] Expire Date:', expireDate);
  console.log(
    '[v0] Expire Date calculated correctly:',
    expireDate > createDate
  );
  console.log('[v0] Sign data:', signData);
  console.log('[v0] Checksum:', vnp_SecureHash);

  return paymentUrl;
};

/**
 * Verify VNPAY response
 */
export const verifyVNPayResponse = (query) => {
  try {
    if (!process.env.VNPAY_HASH_SECRET) {
      throw new Error('VNPAY_HASH_SECRET not configured');
    }

    let vnp_Params = { ...query };
    const secureHash = vnp_Params.vnp_SecureHash;

    // Remove secure hash from params before signing
    delete vnp_Params.vnp_SecureHash;
    delete vnp_Params.vnp_SecureHashType;

    // Sort and create sign string
    vnp_Params = sortObject(vnp_Params);
    const signData = new URLSearchParams(vnp_Params).toString();

    // Calculate checksum
    const checkSign = calculateChecksum(
      signData,
      process.env.VNPAY_HASH_SECRET
    );

    // Compare checksums
    const isValid = secureHash === checkSign;

    const amountInCents = vnp_Params.vnp_Amount
      ? Number.parseInt(vnp_Params.vnp_Amount)
      : 0;
    const amountInVND = amountInCents / 100;
    const amountInUSD = amountInVND / USD_TO_VND_RATE;

    const responseCode = vnp_Params.vnp_ResponseCode || '99';
    const isSuccess = isValid && responseCode === '00';

    console.log('[v0] VNPAY Response Verification:');
    console.log('[v0] Valid Signature:', isValid);
    console.log('[v0] Response Code:', responseCode);
    console.log('[v0] Transaction No:', vnp_Params.vnp_TransactionNo);
    console.log(
      '[v0] Amount received x100:',
      amountInCents,
      '=> VND:',
      amountInVND,
      '=> USD:',
      amountInUSD
    );
    console.log('[v0] Success:', isSuccess);

    return {
      isValid: isValid,
      isSuccess: isSuccess,
      responseCode: responseCode,
      amount: Number.parseFloat(amountInUSD.toFixed(2)),
      transactionNo: vnp_Params.vnp_TransactionNo,
      orderId: vnp_Params.vnp_TxnRef,
      payDate: vnp_Params.vnp_PayDate,
    };
  } catch (error) {
    console.error('[v0] Error verifying VNPAY response:', error.message);
    return {
      isValid: false,
      isSuccess: false,
      responseCode: '99',
      amount: 0,
      transactionNo: null,
      orderId: null,
      payDate: null,
    };
  }
};

/**
 * Check if transaction is new (not processed before)
 */
export const checkIfNewVNPayTransaction = async (orderModel, transactionNo) => {
  if (!transactionNo) {
    return true;
  }
  const existing = await orderModel.findOne({
    'paymentResult.transactionNo': transactionNo,
  });
  return !existing;
};
