package com.plaza.store.outbox;

import com.plaza.store.outbox.OutboxRepository.PendingEvent;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Moves events from the outbox table to RabbitMQ (the second half of the outbox pattern; the first
 * half is writing the row together with the order change).
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
    private static final int BATCH_SIZE = 50;
    private static final long CONFIRM_TIMEOUT_MS = 5_000;

    private final OutboxRepository outboxRepository;
    private final RabbitTemplate rabbitTemplate;

    public OutboxRelay(OutboxRepository outboxRepository, RabbitTemplate rabbitTemplate) {
        this.outboxRepository = outboxRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    /**
     * Publishes one batch of pending events and marks them as published.
     *
     * <p>Lock, publish and mark share one transaction. If the broker is down or does not confirm,
     * the exception rolls the transaction back: the rows stay unpublished and the next run tries
     * again. If the process dies after the broker received the messages but before the commit, the
     * next run sends them a second time. So an event is delivered AT LEAST once, never zero times,
     * and consumers must tolerate a repeated event (they deduplicate by event id).
     *
     * @return how many events were published
     */
    @Scheduled(fixedDelayString = "${plaza.outbox.poll-interval}")
    @Transactional
    public int publishPending() {
        List<PendingEvent> events = outboxRepository.lockPending(BATCH_SIZE);
        if (events.isEmpty()) {
            return 0;
        }

        // invoke() runs everything on one channel, so the wait below covers exactly these sends.
        rabbitTemplate.invoke(channel -> {
            for (PendingEvent event : events) {
                channel.send(OutboxConfig.EXCHANGE, event.routingKey(), toMessage(event));
            }
            // Publisher confirms: sending only puts bytes on the network. This waits
            // until the broker answers "I have stored them", or throws.
            channel.waitForConfirmsOrDie(CONFIRM_TIMEOUT_MS);
            return null;
        });

        outboxRepository.markPublished(events.stream().map(PendingEvent::seq).toList());
        log.info("Published {} outbox events", events.size());
        return events.size();
    }

    private static Message toMessage(PendingEvent event) {
        return MessageBuilder.withBody(event.payload().getBytes(StandardCharsets.UTF_8))
                .setContentType("application/json")
                .setMessageId(event.eventId().toString())
                .setType(event.type())
                // Persistent: the broker writes the message to disk, so it survives a restart.
                .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                .build();
    }
}
