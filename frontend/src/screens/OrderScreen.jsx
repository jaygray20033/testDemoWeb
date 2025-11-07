'use client';

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Row, Col, ListGroup, Image, Card, Button } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import Message from '../components/Message';
import Loader from '../components/Loader';
import {
  useDeliverOrderMutation,
  useGetOrderDetailsQuery,
  usePayOrderMutation,
  useGetVNPayConfigQuery,
} from '../slices/ordersApiSlice';
import { vi } from '../i18n/translations';

const OrderScreen = () => {
  const { id: orderId } = useParams();
  const [isProcessingVNPay, setIsProcessingVNPay] = useState(false);

  const {
    data: order,
    refetch,
    isLoading,
    error,
  } = useGetOrderDetailsQuery(orderId);

  const [payOrder, { isLoading: loadingPay }] = usePayOrderMutation();
  const [deliverOrder, { isLoading: loadingDeliver }] =
    useDeliverOrderMutation();

  const { userInfo } = useSelector((state) => state.auth);

  const {
    data: vnpayConfig,
    isLoading: loadingVNPayConfig,
    error: errorVNPayConfig,
  } = useGetVNPayConfigQuery();

  const handleVNPayPayment = async () => {
    if (!order || order.isPaid) {
      toast.error('Không thể thanh toán đơn hàng này');
      return;
    }

    setIsProcessingVNPay(true);

    try {
      // Call backend to create VNPay payment URL
      const response = await fetch('/api/orders/' + orderId + '/vnpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: order.totalPrice,
          orderInfo: `Payment for order ${orderId}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Lỗi tạo URL thanh toán');
      }

      // Redirect to VNPay payment page
      window.location.href = data.paymentUrl;
    } catch (err) {
      toast.error(err.message || 'Lỗi khi xử lý thanh toán');
      setIsProcessingVNPay(false);
    }
  };

  const deliverHandler = async () => {
    await deliverOrder(orderId);
    refetch();
  };

  return isLoading ? (
    <Loader />
  ) : error ? (
    <Message variant='danger'>{error.data.message}</Message>
  ) : (
    <>
      <h1>
        {vi.paymentInfo} {order._id}
      </h1>
      <Row>
        <Col md={8}>
          <ListGroup variant='flush'>
            <ListGroup.Item>
              <h2>{vi.shipping}</h2>
              <p>
                <strong>{vi.login}: </strong> {order.user.name}
              </p>
              <p>
                <strong>Email: </strong>
                <a href={`mailto:${order.user.email}`}>{order.user.email}</a>
              </p>
              <p>
                <strong>{vi.address}:</strong>
                {order.shippingAddress.address}, {order.shippingAddress.city}{' '}
                {order.shippingAddress.postalCode},{' '}
                {order.shippingAddress.country}
              </p>
              {order.isDelivered ? (
                <Message variant='success'>
                  {vi.delivered}: {order.deliveredAt}
                </Message>
              ) : (
                <Message variant='danger'>{vi.notDelivered}</Message>
              )}
            </ListGroup.Item>

            <ListGroup.Item>
              <h2>{vi.paymentMethod}</h2>
              <p>
                <strong>{vi.method}: </strong>
                {order.paymentMethod}
              </p>
              {order.isPaid ? (
                <Message variant='success'>
                  {vi.paid}: {order.paidAt}
                </Message>
              ) : (
                <Message variant='danger'>{vi.notPaid}</Message>
              )}
            </ListGroup.Item>

            <ListGroup.Item>
              <h2>{vi.orderItems}</h2>
              {order.orderItems.length === 0 ? (
                <Message>{vi.orderIsEmpty}</Message>
              ) : (
                <ListGroup variant='flush'>
                  {order.orderItems.map((item, index) => (
                    <ListGroup.Item key={index}>
                      <Row>
                        <Col md={1}>
                          <Image
                            src={item.image || '/placeholder.svg'}
                            alt={item.name}
                            fluid
                            rounded
                          />
                        </Col>
                        <Col>
                          <Link to={`/product/${item.product}`}>
                            {item.name}
                          </Link>
                        </Col>
                        <Col md={4}>
                          {item.qty} x ${item.price} = ${item.qty * item.price}
                        </Col>
                      </Row>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
            </ListGroup.Item>
          </ListGroup>
        </Col>
        <Col md={4}>
          <Card>
            <ListGroup variant='flush'>
              <ListGroup.Item>
                <h2>{vi.orderSummary}</h2>
              </ListGroup.Item>
              <ListGroup.Item>
                <Row>
                  <Col>{vi.items}</Col>
                  <Col>${order.itemsPrice}</Col>
                </Row>
              </ListGroup.Item>
              <ListGroup.Item>
                <Row>
                  <Col>{vi.shipping}</Col>
                  <Col>${order.shippingPrice}</Col>
                </Row>
              </ListGroup.Item>
              <ListGroup.Item>
                <Row>
                  <Col>{vi.tax}</Col>
                  <Col>${order.taxPrice}</Col>
                </Row>
              </ListGroup.Item>
              <ListGroup.Item>
                <Row>
                  <Col>{vi.total}</Col>
                  <Col>${order.totalPrice}</Col>
                </Row>
              </ListGroup.Item>
              {!order.isPaid && (
                <ListGroup.Item>
                  {loadingPay && <Loader />}
                  {isProcessingVNPay ? (
                    <Loader />
                  ) : (
                    <Button
                      type='button'
                      className='btn-block'
                      onClick={handleVNPayPayment}
                      disabled={isProcessingVNPay}
                    >
                      Thanh Toán VNPay
                    </Button>
                  )}
                </ListGroup.Item>
              )}

              {loadingDeliver && <Loader />}

              {userInfo &&
                userInfo.isAdmin &&
                order.isPaid &&
                !order.isDelivered && (
                  <ListGroup.Item>
                    <Button
                      type='button'
                      className='btn-block'
                      onClick={deliverHandler}
                    >
                      {vi.markAsDelivered}
                    </Button>
                  </ListGroup.Item>
                )}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default OrderScreen;
