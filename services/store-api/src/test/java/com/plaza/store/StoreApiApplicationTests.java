package com.plaza.store;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class StoreApiApplicationTests {

    // Fails if the application cannot start: bad config, a failing migration,
    // or an entity that does not match the schema (ddl-auto=validate).
    @Test
    void contextLoads() {}
}
