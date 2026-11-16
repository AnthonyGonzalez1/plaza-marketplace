package com.plaza.store.catalog;

import com.plaza.store.shared.PageParams;
import com.plaza.store.shared.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
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
    @Operation(summary = "Search and list products with filters, sorting and pagination")
    public PageResponse<ProductSummary> searchProducts(
            @Parameter(description = "Words to search in name and description (Spanish)")
                    @RequestParam(required = false)
                    String q,
            @RequestParam(required = false) Long storeId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @Parameter(
                            description =
                                    "relevance, price_asc, price_desc or newest. Default:"
                                            + " relevance when q is present, otherwise newest")
                    @RequestParam(required = false)
                    String sort,
            @Parameter(description = "Page number, starting at 0") @RequestParam(defaultValue = "0")
                    int page,
            @Parameter(description = "Items per page, from 1 to 100")
                    @RequestParam(defaultValue = "20")
                    int size) {
        ProductSearchCriteria criteria =
                ProductSearchCriteria.of(q, storeId, categoryId, minPrice, maxPrice, sort);
        return catalogService.searchProducts(criteria, new PageParams(page, size));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one product by id")
    public ProductDetail getProduct(@PathVariable long id) {
        return catalogService.getProduct(id);
    }
}
