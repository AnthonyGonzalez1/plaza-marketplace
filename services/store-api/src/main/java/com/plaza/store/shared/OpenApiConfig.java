package com.plaza.store.shared;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Title and version shown in the generated OpenAPI spec and in Swagger UI. */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI storeApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("Plaza Marketplace store API")
                                .description("Catalog of stores and products.")
                                .version("v1"));
    }
}
