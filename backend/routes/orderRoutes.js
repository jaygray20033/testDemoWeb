// backend/routes/orderRoutes.js
import express from 'express';
const router = express.Router();
import {
  addOrderItems,
  getMyOrders,
  getOrderById,
  updateOrderToPaid,
  createVNPayPayment,
  vnpayReturn,
  updateOrderToDelivered,
  getOrders,
} from '../controllers/orderController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

router.route('/').post(protect, addOrderItems).get(protect, admin, getOrders);
router.route('/mine').get(protect, getMyOrders);

router.get('/vnpay/return', vnpayReturn);

router.route('/:id').get(protect, getOrderById);
router.route('/:id/pay').put(protect, updateOrderToPaid);
router.route('/:id/vnpay').post(protect, createVNPayPayment);
router.route('/:id/deliver').put(protect, admin, updateOrderToDelivered);

export default router;
