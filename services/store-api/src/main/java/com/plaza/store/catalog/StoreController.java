package com.plaza.store.catalog;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stores")
@Tag(name = "Stores")
public class StoreController {

    private final CatalogService catalogService;

    public StoreController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    @Operation(summary = "List all stores ordered by name")
    public List<StoreResponse> listStores() {
        return catalogService.listStores();
    }
}
