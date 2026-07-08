function shippingLabel(order) {
  const address = order.customer.address;
  return address.street + ', ' + address.city + ' ' + address.zip;
}

function firstItemName(order) {
  return order.items[0].name;
}

module.exports = { shippingLabel, firstItemName };
