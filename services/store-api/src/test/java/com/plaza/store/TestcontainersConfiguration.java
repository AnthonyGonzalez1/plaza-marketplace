package com.plaza.store;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.rabbitmq.RabbitMQContainer;

/**
 * Starts a real PostgreSQL 18, Redis 8 and RabbitMQ 4 in Docker for the integration tests.
 * {@code @ServiceConnection} points the application at the containers, so no test URL or password
 * is configured by hand. Spring reuses the same context (and containers) across test classes that
 * import this.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer("postgres:18");
    }

    // There is no Redis-specific container class: a generic one plus the name tells Spring
    // which kind of service this is.
    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redisContainer() {
        return new GenericContainer<>("redis:8-alpine").withExposedPorts(6379);
    }

    @Bean
    @ServiceConnection
    RabbitMQContainer rabbitContainer() {
        return new RabbitMQContainer("rabbitmq:4-alpine");
    }

    // The payment gateway is another company's service: tests never call it. @Primary makes
    // Spring inject this fake wherever a PaymentGateway is needed, instead of the HTTP one.
    @Bean
    @Primary
    FakePaymentGateway fakePaymentGateway() {
        return new FakePaymentGateway();
    }
}
