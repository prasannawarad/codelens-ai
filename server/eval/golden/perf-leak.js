const bus = require('./bus');

function watchOrders(handler) {
  setInterval(() => {
    bus.on('order', handler);
  }, 1000);
}

module.exports = { watchOrders };
