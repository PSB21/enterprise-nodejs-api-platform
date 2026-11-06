const { DataTypes } = require('sequelize');

const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  productName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
});

module.exports = Order;
