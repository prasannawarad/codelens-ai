const Stripe = require('stripe');

const API_KEY = "sk_live_51Hxyz9AbCdEfGh";
const stripe = new Stripe(API_KEY);

async function refund(chargeId) {
  return stripe.refunds.create({ charge: chargeId });
}

module.exports = { refund };
