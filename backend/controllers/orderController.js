// backend/controllers/orderController.js
import asyncHandler from '../middleware/asyncHandler.js';
import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import { calcPrices } from '../utils/calcPrices.js';
import {
  createVNPayPaymentURL,
  verifyVNPayResponse,
  checkIfNewVNPayTransaction,
} from '../utils/vnpay.js';

const addOrderItems = asyncHandler(async (req, res) => {
  /* giữ nguyên như bạn */
});

const getMyOrders = asyncHandler(async (req, res) => {
  /* giữ nguyên */
});

const getOrderById = asyncHandler(async (req, res) => {
  /* giữ nguyên */
});

const updateOrderToPaid = asyncHandler(async (req, res) => {
  const verification = verifyVNPayResponse(req.body);
  if (!verification.isSuccess) {
    res.status(400);
    throw new Error('Thanh toán VNPAY không hợp lệ');
  }

  const isNew = await checkIfNewVNPayTransaction(
    Order,
    req.body.vnp_TransactionNo
  );
  if (!isNew) {
    res.status(400);
    throw new Error('Giao dịch đã được xử lý trước đó');
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Không tìm thấy đơn hàng');
  }

  const paidAmount = verification.amount;
  if (Math.abs(paidAmount - order.totalPrice) > 0.01) {
    res.status(400);
    throw new Error('Số tiền không khớp');
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

  const paymentUrl = createVNPayPaymentURL(
    req,
    order.totalPrice,
    order._id.toString(),
    `Thanh toan don hang #${order._id}`
  );

  res.json({ paymentUrl });
});

const vnpayReturn = asyncHandler(async (req, res) => {
  const result = verifyVNPayResponse(req.query);

  if (result.isSuccess) {
    const order = await Order.findById(req.query.vnp_TxnRef);
    if (order && !order.isPaid) {
      order.isPaid = true;
      order.paidAt = new Date();
      order.paymentResult = {
        transactionNo: req.query.vnp_TransactionNo,
        status: 'COMPLETED',
      };
      await order.save();
    }
    res.redirect(`http://localhost:3000/order/${req.query.vnp_TxnRef}`);
  } else {
    res.redirect(`http://localhost:3000?payment=fail`);
  }
});

const updateOrderToDelivered = asyncHandler(async (req, res) => {
  /* giữ nguyên */
});
const getOrders = asyncHandler(async (req, res) => {
  /* giữ nguyên */
});

export {
  addOrderItems,
  getMyOrders,
  getOrderById,
  updateOrderToPaid,
  createVNPayPayment,
  vnpayReturn, // ← THÊM DÒNG NÀY
  updateOrderToDelivered,
  getOrders,
};
