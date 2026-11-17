package com.plaza.store.outbox;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OutboxConfig {

    /**
     * In RabbitMQ a publisher never writes to a queue: it sends to an EXCHANGE with a routing key
     * ("order.paid"), and the exchange copies the message to every queue bound with a matching
     * pattern. This API does not know who listens. Today the notification service binds its own
     * queue with "order.*"; another consumer can be added later without touching this code.
     */
    public static final String EXCHANGE = "plaza.events";

    // Declared on the broker the first time the application connects. Durable: it survives a
    // broker restart. Declaring an exchange that already exists with the same settings is fine.
    @Bean
    TopicExchange plazaEventsExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }
}
