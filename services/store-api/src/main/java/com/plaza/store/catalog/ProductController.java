package com.plaza.store.catalog;

import com.plaza.store.shared.PageParams;
import com.plaza.store.shared.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/products")
@Tag(name = "Products")
public class ProductController {

    private final CatalogService catalogService;

    public ProductController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping
    @Operation(summary = "List products, newest first, one page at a time")
    public PageResponse<ProductSummary> listProducts(
            @RequestParam(required = false) Long storeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return catalogService.listProducts(storeId, new PageParams(page, size));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one product by id")
    public ProductDetail getProduct(@PathVariable long id) {
        return catalogService.getProduct(id);
    }
}
