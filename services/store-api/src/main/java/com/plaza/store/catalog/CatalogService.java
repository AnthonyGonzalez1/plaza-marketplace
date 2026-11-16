package com.plaza.store.catalog;

import com.plaza.store.shared.NotFoundException;
import com.plaza.store.shared.PageParams;
import com.plaza.store.shared.PageResponse;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read operations of the catalog. Controllers call this class, never the repositories. */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;

    public CatalogService(ProductRepository productRepository, StoreRepository storeRepository) {
        this.productRepository = productRepository;
        this.storeRepository = storeRepository;
    }

    public PageResponse<ProductSummary> listProducts(Long storeId, PageParams pageParams) {
        // A fixed order is required: without ORDER BY the database may return rows in any
        // order, and two pages could then repeat or skip products.
        Pageable pageable =
                PageRequest.of(pageParams.page(), pageParams.size(), Sort.by("id").descending());

        Page<Product> products =
                storeId == null
                        ? productRepository.findAll(pageable)
                        : productRepository.findByStoreId(storeId, pageable);

        List<ProductSummary> items =
                products.getContent().stream().map(CatalogMapper::toSummary).toList();
        return PageResponse.of(items, pageParams, products.getTotalElements());
    }

    public ProductDetail getProduct(long id) {
        Product product =
                productRepository
                        .findById(id)
                        .orElseThrow(() -> new NotFoundException("Product " + id + " not found"));
        return CatalogMapper.toDetail(product);
    }

    public List<StoreResponse> listStores() {
        return storeRepository.findAllByOrderByNameAsc().stream()
                .map(CatalogMapper::toStoreResponse)
                .toList();
    }
}
