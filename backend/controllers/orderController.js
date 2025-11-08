import asyncHandler from '../middleware/asyncHandler.js';
import Order from '../models/orderModel.js';
import {
  createVNPayPaymentURL,
  verifyVNPayResponse,
  checkIfNewVNPayTransaction,
} from '../utils/vnpay.js';

const addOrderItems = asyncHandler(async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    res.status(400);
    throw new Error('Không có mặt hàng trong đơn hàng');
  }

  const order = new Order({
    orderItems: orderItems.map((x) => ({
      ...x,
      product: x._id,
      _id: undefined,
    })),
    shippingAddress,
    paymentMethod,
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
    user: req.user._id,
  });

  const createdOrder = await order.save();
  res.status(201).json(createdOrder);
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    'user',
    'name email'
  );

  if (order) {
    return res.json(order);
  }
  res.status(404);
  throw new Error('Không tìm thấy đơn hàng');
});

const updateOrderToPaid = asyncHandler(async (req, res) => {
  const verification = verifyVNPayResponse(req.body);

  if (!verification.isValid) {
    console.log('[v0] Invalid payment signature');
    res.status(400);
    throw new Error('Thanh toán không hợp lệ - chữ ký sai');
  }

  if (!verification.isSuccess) {
    console.log('[v0] Payment failed with code:', verification.responseCode);
    res.status(400);
    throw new Error(
      `Thanh toán không thành công - mã lỗi: ${verification.responseCode}`
    );
  }

  const isNew = await checkIfNewVNPayTransaction(
    Order,
    verification.transactionNo
  );
  if (!isNew) {
    console.log('[v0] Transaction already processed');
    res.status(400);
    throw new Error('Giao dịch đã được xử lý');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Không tìm thấy đơn hàng');
  }

  const paidAmount = verification.amount;
  const tolerance = 100000; // 100,000 VND tolerance instead of $1
  const amountDifference = Math.abs(
    paidAmount - Number.parseFloat(order.totalPrice)
  );

  console.log(
    '[v0] Amount check - Expected:',
    order.totalPrice,
    'Received:',
    paidAmount,
    'Diff:',
    amountDifference
  );

  if (amountDifference > tolerance) {
    res.status(400);
    throw new Error(
      `Số tiền không khớp: ${order.totalPrice}₫ vs ${paidAmount}₫`
    );
  }

  order.isPaid = true;
  order.paidAt = new Date();
  order.paymentResult = {
    id: verification.orderId,
    status: 'COMPLETED',
    update_time: verification.payDate,
    email_address: 'vnpay@vnpay.vn',
    transactionNo: verification.transactionNo,
  };

  const updatedOrder = await order.save();
  console.log('[v0] Order marked as paid:', updatedOrder._id);
  res.json(updatedOrder);
});

const createVNPayPayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Không tìm thấy đơn hàng');
  }
  if (order.isPaid) {
    res.status(400);
    throw new Error('Đơn hàng đã thanh toán');
  }

  const now = new Date();
  const createdTime = new Date(order.createdAt);
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // If order is older than 15 minutes and not paid, it's a timeout - allow new attempt
  if (createdTime < fifteenMinutesAgo && !order.isPaid) {
    console.log(
      '[v0] Previous payment attempt expired, allowing retry for order:',
      req.params.id
    );
  }

  try {
    const paymentUrl = createVNPayPaymentURL(
      req,
      order.totalPrice,
      order._id.toString(),
      `Thanh toan don hang #${order._id}`
    );

    res.json({ paymentUrl });
  } catch (error) {
    res.status(500);
    throw new Error('Lỗi tạo URL thanh toán VNPay: ' + error.message);
  }
});

const vnpayReturn = asyncHandler(async (req, res) => {
  const query = req.query;
  const result = verifyVNPayResponse(query);

  const orderId = query.vnp_TxnRef;
  const returnUrl = process.env.REACT_APP_API || 'http://localhost:3000';

  if (!result.isValid) {
    console.log('[v0] Invalid signature in return');
    return res.send(`
      <html>
        <head><title>Thanh toán VNPAY</title><meta charset="utf-8"></head>
        <body>
          <script>
            window.location.href = '${returnUrl}/order/${orderId}?payment=fail&reason=invalid_signature';
          </script>
        </body>
      </html>
    `);
  }

  if (result.isSuccess) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        console.log('[v0] Order not found:', orderId);
        return res.send(`
          <html>
            <head><title>Thanh toán VNPAY</title><meta charset="utf-8"></head>
            <body>
              <script>
                window.location.href = '${returnUrl}?payment=fail&reason=order_not_found';
              </script>
            </body>
          </html>
        `);
      }

      if (!order.isPaid) {
        order.isPaid = true;
        order.paidAt = new Date();
        order.paymentResult = {
          id: orderId,
          transactionNo: result.transactionNo,
          status: 'COMPLETED',
          update_time: result.payDate,
          email_address: 'vnpay@vnpay.vn',
        };
        await order.save();
        console.log('[v0] Order paid successfully:', orderId);
      }

      return res.send(`
        <html>
          <head><title>Thanh toán VNPAY</title><meta charset="utf-8"></head>
          <body>
            <script>
              window.location.href = '${returnUrl}/order/${orderId}?payment=success';
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('[v0] Error processing payment:', error.message);
      return res.send(`
        <html>
          <head><title>Thanh toán VNPAY</title><meta charset="utf-8"></head>
          <body>
            <script>
              window.location.href = '${returnUrl}?payment=fail&reason=processing_error';
            </script>
          </body>
        </html>
      `);
    }
  } else {
    console.log('[v0] Payment failed, response code:', result.responseCode);
    return res.send(`
      <html>
        <head><title>Thanh toán VNPAY</title><meta charset="utf-8"></head>
        <body>
          <script>
            window.location.href = '${returnUrl}/order/${orderId}?payment=fail&reason=vnpay_error&code=${result.responseCode}';
          </script>
        </body>
      </html>
    `);
  }
});

const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy đơn hàng');
  }
});

const getOrders = asyncHandler(async (req, res) => {
  console.log(
    '[v0] getOrders called - user:',
    req.user._id,
    'isAdmin:',
    req.user.isAdmin
  );

  const orders = await Order.find({})
    .populate('user', 'id name')
    .sort({ createdAt: -1 });

  console.log('[v0] Found orders:', orders.length);
  res.json(orders);
});

export {
  addOrderItems,
  getMyOrders,
  getOrderById,
  updateOrderToPaid,
  createVNPayPayment,
  vnpayReturn,
  updateOrderToDelivered,
  getOrders,
};
