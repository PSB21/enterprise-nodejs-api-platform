const express = require('express');

const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

const Order = require('../models/order.model');

const router = express.Router();

// CREATE ORDER
router.post('/', authMiddleware, roleMiddleware('admin', 'user'), async (req, res, next) => {
  try {
    const { productName, quantity, price } = req.body;

    const order = await Order.create({
      productName,
      quantity,
      price,
    });

    res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
});

// GET ALL ORDERS
router.get('/', authMiddleware, roleMiddleware('admin', 'user'), async (req, res, next) => {
  try {
    const orders = await Order.findAll();

    res.json({
      success: true,
      orders,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
