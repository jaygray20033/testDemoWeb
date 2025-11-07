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
  console.log('[v0] Payment verification result:', {
    isValid: verification.isValid,
    isSuccess: verification.isSuccess,
    amount: verification.amount,
  });

  if (!verification.isValid) {
    console.log('[v0] Payment signature invalid');
    res.status(400);
    throw new Error('Thanh toán VNPAY không hợp lệ - chữ ký sai');
  }

  if (!verification.isSuccess) {
    console.log(
      '[v0] Payment not successful - response code:',
      verification.responseCode
    );
    res.status(400);
    throw new Error(
      `Thanh toán VNPAY không thành công - mã lỗi: ${verification.responseCode}`
    );
  }

  const isNew = await checkIfNewVNPayTransaction(
    Order,
    req.body.vnp_TransactionNo
  );
  if (!isNew) {
    console.log('[v0] Transaction already processed');
    res.status(400);
    throw new Error('Giao dịch đã được xử lý trước đó');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Không tìm thấy đơn hàng');
  }

  const paidAmount = verification.amount;
  const tolerance = 0.5;
  const amountDifference = Math.abs(
    paidAmount - Number.parseFloat(order.totalPrice)
  );

  console.log(
    '[v0] Amount comparison - Expected:',
    order.totalPrice,
    'Received:',
    paidAmount,
    'Difference:',
    amountDifference
  );

  if (amountDifference > tolerance) {
    res.status(400);
    throw new Error(
      `Số tiền không khớp: mong đợi ${order.totalPrice}$ nhưng nhận ${paidAmount}$`
    );
  }

  order.isPaid = true;
  order.paidAt = new Date();
  order.paymentResult = {
    id: req.body.vnp_TxnRef,
    status: 'COMPLETED',
    update_time: req.body.vnp_PayDate,
    email_address: 'vnpay@vnpay.vn',
    transactionNo: req.body.vnp_TransactionNo,
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

  try {
    const paymentUrl = createVNPayPaymentURL(
      req,
      order.totalPrice,
      order._id.toString(),
      `Thanh toan don hang #${order._id}`
    );

    console.log('[v0] VNPay payment URL created for order:', order._id);
    return res.json({ paymentUrl });
  } catch (error) {
    console.log('[v0] Error creating VNPay payment URL:', error.message);
    res.status(500);
    throw new Error('Lỗi tạo URL thanh toán VNPay: ' + error.message);
  }
});

const vnpayReturn = asyncHandler(async (req, res) => {
  console.log('[v0] VNPay return request received:', req.query);

  const result = verifyVNPayResponse(req.query);

  console.log('[v0] VNPay Return - Signature valid:', result.isValid);
  console.log('[v0] VNPay Return - Response code:', result.responseCode);
  console.log('[v0] VNPay Return - Order ID:', req.query.vnp_TxnRef);

  if (!result.isValid) {
    console.log('[v0] Invalid VNPay signature');
    return res.send(`
      <html>
        <head><title>Thanh toán</title></head>
        <body>
          <script>
            window.location.href = '${process.env.REACT_APP_API}/order/${req.query.vnp_TxnRef}?payment=fail&reason=invalid_signature';
          </script>
        </body>
      </html>
    `);
  }

  if (result.responseCode === '00') {
    try {
      const order = await Order.findById(req.query.vnp_TxnRef);
      if (!order) {
        console.log('[v0] Order not found:', req.query.vnp_TxnRef);
        return res.send(`
          <html>
            <head><title>Thanh toán</title></head>
            <body>
              <script>
                window.location.href = '${process.env.REACT_APP_API}?payment=fail&reason=order_not_found';
              </script>
            </body>
          </html>
        `);
      }

      if (!order.isPaid) {
        order.isPaid = true;
        order.paidAt = new Date();
        order.paymentResult = {
          id: req.query.vnp_TxnRef,
          transactionNo: req.query.vnp_TransactionNo,
          status: 'COMPLETED',
          update_time: req.query.vnp_PayDate,
          email_address: 'vnpay@vnpay.vn',
        };
        await order.save();
        console.log('[v0] Order marked as paid:', req.query.vnp_TxnRef);
      }

      return res.send(`
        <html>
          <head><title>Thanh toán</title></head>
          <body>
            <script>
              window.location.href = '${process.env.REACT_APP_API}/order/${req.query.vnp_TxnRef}?payment=success';
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.log('[v0] Error updating order:', error.message);
      return res.send(`
        <html>
          <head><title>Thanh toán</title></head>
          <body>
            <script>
              window.location.href = '${process.env.REACT_APP_API}?payment=fail&reason=processing_error';
            </script>
          </body>
        </html>
      `);
    }
  } else {
    console.log(
      '[v0] VNPay payment failed. Response code:',
      result.responseCode
    );
    return res.send(`
      <html>
        <head><title>Thanh toán</title></head>
        <body>
          <script>
            window.location.href = '${process.env.REACT_APP_API}/order/${req.query.vnp_TxnRef}?payment=fail&reason=vnpay_failed&code=${result.responseCode}';
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
