package com.plaza.store.ordering;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Checkout reserves stock for an order that may never be paid. This job is what gives those units
 * back: every few seconds it cancels the pending orders whose payment window is over.
 */
@Component
public class ExpiredOrderJob {

    private static final Logger log = LoggerFactory.getLogger(ExpiredOrderJob.class);

    private final OrderService orderService;

    public ExpiredOrderJob(OrderService orderService) {
        this.orderService = orderService;
    }

    // fixedDelay: the wait is counted from the END of the previous run, so two runs of this
    // instance never overlap. With several instances of the API, each one runs the job; that is
    // safe because the SQL only touches orders that are still pending, so an order can be
    // cancelled (and its stock returned) only once.
    @Scheduled(fixedDelayString = "${plaza.orders.expiry-check-interval}")
    public void cancelExpiredOrders() {
        int cancelled = orderService.cancelExpiredOrders();
        if (cancelled > 0) {
            log.info("Cancelled {} unpaid orders and returned their stock", cancelled);
        }
    }
}
