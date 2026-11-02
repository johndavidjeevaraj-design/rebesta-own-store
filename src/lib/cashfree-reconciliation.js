import {
  pendingCashfreeOrders,
  getOrder,
  markPayuPayment,
  updateOrderStatus,
  markCashfreeReconciliationChecked,
  claimOrderConfirmationNotice
} from './store.js';
import {
  cashfreeEnabled,
  getCashfreeOrder,
  getCashfreePayments,
  validateCashfreeOrder,
  validateCashfreePayment
} from './cashfree.js';
import { orderPlacedEmails } from './mailer.js';
import { notifyOrderConfirmed } from '../sms.js';

const INTERVAL_MS = 5 * 60 * 1000;
const MIN_AGE_MS = 2 * 60 * 1000;
const NOT_FOUND_GRACE_MS = 10 * 60 * 1000;
let running = false;

function notifyPaidOrder(orderId) {
  const order = claimOrderConfirmationNotice(orderId);
  if (!order) return;
  void Promise.resolve().then(() => orderPlacedEmails(order)).catch(error =>
    console.error('Cashfree reconciliation email failed', order.id, error.message));
  void Promise.resolve().then(() => notifyOrderConfirmed(order, { paid: true })).catch(error =>
    console.error('Cashfree reconciliation notification failed', order.id, error.message));
}

/* Reconcile delayed/missed redirects and webhook delivery. Only provider
   Get Order + Get Payments responses can settle an order. Expired or confirmed
   not-found provider orders release the reservation; ambiguous API errors do
   not. */
export async function reconcileCashfreePayments() {
  if (running || !cashfreeEnabled()) return { skipped: true, checked: 0 };
  running = true;
  let checked = 0;
  try {
    const candidates = pendingCashfreeOrders({ olderThanMs: MIN_AGE_MS, limit: 25 });
    for (const snapshot of candidates) {
      const order = getOrder(snapshot.id);
      if (!order) continue;
      const paymentStatus = String(order.paymentStatus || '').toUpperCase();
      const cancelledUnpaid = String(order.status || '').toUpperCase() === 'CANCELLED'
        && paymentStatus === 'CANCELLED_NO_CHARGE';
      if (!cancelledUnpaid && !['PENDING', 'FAILED'].includes(paymentStatus)) continue;
      checked += 1;
      try {
        const providerOrder = await getCashfreeOrder(order.id);
        if (cancelledUnpaid) {
          /* A provider-terminated order should not be payable, but still inspect
             its transaction history for a late bank authorization. */
          const payments = await getCashfreePayments(order.id);
          const latePayment = payments.find(item => validateCashfreePayment(order, item).valid);
          if (latePayment) {
            const lateCheck = validateCashfreePayment(order, latePayment);
            markPayuPayment(order.id, {
              success: true,
              reference: lateCheck.paymentId,
              mode: 'cashfree',
              provider: 'cashfree',
              raw: {
                order_id: providerOrder.order_id,
                order_status: providerOrder.order_status,
                payment_id: lateCheck.paymentId,
                payment_status: latePayment.payment_status,
                payment_amount: latePayment.payment_amount,
                payment_currency: latePayment.payment_currency
              }
            });
          } else {
            markCashfreeReconciliationChecked(order.id);
          }
          continue;
        }
        const verification = validateCashfreeOrder(order, providerOrder);
        if (verification.valid) {
          const payments = await getCashfreePayments(order.id);
          const payment = payments.find(item => validateCashfreePayment(order, item).valid);
          if (payment) {
            const check = validateCashfreePayment(order, payment);
            markPayuPayment(order.id, {
              success: true,
              reference: check.paymentId,
              mode: 'cashfree',
              provider: 'cashfree',
              raw: {
                order_id: providerOrder.order_id,
                cf_order_id: providerOrder.cf_order_id,
                order_status: providerOrder.order_status,
                payment_id: check.paymentId,
                payment_status: payment.payment_status,
                payment_amount: payment.payment_amount,
                payment_currency: payment.payment_currency
              }
            });
            notifyPaidOrder(order.id);
          }
          continue;
        }

        const providerStatus = String(providerOrder.order_status || '').toUpperCase();
        if (providerStatus === 'TERMINATED') {
          updateOrderStatus(order.id, 'CANCELLED', 'Cashfree order terminated; reservation released by reconciliation');
        } else if (providerStatus === 'EXPIRED') {
          markPayuPayment(order.id, {
            success: false,
            reference: '',
            mode: 'cashfree',
            provider: 'cashfree',
            raw: { order_id: providerOrder.order_id, order_status: providerStatus }
          });
        }
      } catch (error) {
        const age = Date.now() - new Date(order.placedAt || 0).getTime();
        if (cancelledUnpaid && Number(error?.status) === 404) {
          markCashfreeReconciliationChecked(order.id);
        } else if (Number(error?.status) === 404 && age >= NOT_FOUND_GRACE_MS) {
          /* After a generous propagation window, an authoritative 404 means
             Cashfree never created this merchant order; reservation is safe to
             release. Network/5xx/401 errors are intentionally left pending. */
          markPayuPayment(order.id, {
            success: false,
            reference: '',
            mode: 'cashfree',
            provider: 'cashfree',
            raw: { reconciliation: 'provider_order_not_found_after_grace' }
          });
        } else {
          console.warn(JSON.stringify({
            event: 'cashfree.reconciliation.deferred',
            order: order.id,
            status: error?.status || null,
            error: String(error?.message || error).slice(0, 180)
          }));
        }
      }
    }
    return { skipped: false, checked };
  } finally {
    running = false;
  }
}

export function startCashfreeReconciliation() {
  const timer = setInterval(() => {
    void reconcileCashfreePayments().catch(error =>
      console.error('Cashfree reconciliation failed', String(error?.message || error).slice(0, 250)));
  }, INTERVAL_MS);
  timer.unref();
  void reconcileCashfreePayments();
  return timer;
}
