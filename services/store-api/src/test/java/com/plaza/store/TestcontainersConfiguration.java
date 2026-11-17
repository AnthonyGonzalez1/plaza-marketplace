package com.plaza.store;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Starts a real PostgreSQL 18 and a real Redis 8 in Docker for the integration tests.
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
}
