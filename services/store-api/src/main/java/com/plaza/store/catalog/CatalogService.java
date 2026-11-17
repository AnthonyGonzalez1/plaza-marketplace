package com.plaza.store.catalog;

import com.plaza.store.inventory.Inventory;
import com.plaza.store.inventory.InventoryRepository;
import com.plaza.store.shared.NotFoundException;
import com.plaza.store.shared.PageParams;
import com.plaza.store.shared.PageResponse;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read operations of the catalog. Controllers call this class, never the repositories. */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    private final ProductSearchRepository productSearchRepository;
    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;
    private final StoreRepository storeRepository;
    private final CategoryRepository categoryRepository;

    public CatalogService(
            ProductSearchRepository productSearchRepository,
            ProductRepository productRepository,
            InventoryRepository inventoryRepository,
            StoreRepository storeRepository,
            CategoryRepository categoryRepository) {
        this.productSearchRepository = productSearchRepository;
        this.productRepository = productRepository;
        this.inventoryRepository = inventoryRepository;
        this.storeRepository = storeRepository;
        this.categoryRepository = categoryRepository;
    }

    public PageResponse<ProductSummary> searchProducts(
            ProductSearchCriteria criteria, PageParams pageParams) {
        // Two queries: the rows of the requested page, and the total used for totalPages.
        List<ProductSummary> items = productSearchRepository.search(criteria, pageParams);
        long totalItems = productSearchRepository.count(criteria);
        return PageResponse.of(items, pageParams, totalItems);
    }

    public ProductDetail getProduct(long id) {
        Product product =
                productRepository
                        .findById(id)
                        .orElseThrow(() -> new NotFoundException("Product " + id + " not found"));
        // A product without an inventory row simply has nothing to sell.
        int available = inventoryRepository.findById(id).map(Inventory::getAvailable).orElse(0);
        return CatalogMapper.toDetail(product, available);
    }

    public List<StoreResponse> listStores() {
        return storeRepository.findAllByOrderByNameAsc().stream()
                .map(CatalogMapper::toStoreResponse)
                .toList();
    }

    public List<CategoryResponse> listCategories() {
        return categoryRepository.findAllByOrderByNameAsc().stream()
                .map(CatalogMapper::toCategoryResponse)
                .toList();
    }
}
