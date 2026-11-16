package com.plaza.store.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.plaza.store.shared.InvalidRequestException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** Pure unit tests of the search defaults and validation rules: no Spring, no database. */
class ProductSearchCriteriaTest {

    @Test
    void sortDefaultsToNewestWithoutSearchText() {
        assertThat(criteria(null, null).sort()).isEqualTo(ProductSort.NEWEST);
    }

    @Test
    void sortDefaultsToRelevanceWithSearchText() {
        assertThat(criteria("café", null).sort()).isEqualTo(ProductSort.RELEVANCE);
    }

    @Test
    void explicitSortWins() {
        assertThat(criteria("café", "price_asc").sort()).isEqualTo(ProductSort.PRICE_ASC);
        assertThat(criteria(null, "price_desc").sort()).isEqualTo(ProductSort.PRICE_DESC);
        assertThat(criteria("café", "newest").sort()).isEqualTo(ProductSort.NEWEST);
    }

    @Test
    void relevanceWithoutSearchTextFallsBackToNewest() {
        assertThat(criteria(null, "relevance").sort()).isEqualTo(ProductSort.NEWEST);
        assertThat(criteria("   ", "relevance").sort()).isEqualTo(ProductSort.NEWEST);
    }

    @Test
    void blankSearchTextMeansNoSearch() {
        assertThat(criteria("", null).q()).isNull();
        assertThat(criteria("   ", null).q()).isNull();
        assertThat(criteria("  ruana  ", null).q()).isEqualTo("ruana");
    }

    @Test
    void rejectsUnknownSort() {
        assertThatThrownBy(() -> criteria(null, "cheapest"))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage(
                        "sort must be one of relevance, price_asc, price_desc, newest,"
                                + " but was 'cheapest'");
    }

    @Test
    void sortIsCaseSensitive() {
        assertThatThrownBy(() -> criteria(null, "NEWEST"))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsMinPriceGreaterThanMaxPrice() {
        assertThatThrownBy(() -> withPrices("50000", "10000"))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("minPrice (50000) must not be greater than maxPrice (10000)");
    }

    @Test
    void rejectsNegativePrices() {
        assertThatThrownBy(() -> withPrices("-1", null))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("minPrice must be 0 or greater, but was -1");
        assertThatThrownBy(() -> withPrices(null, "-1"))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("maxPrice must be 0 or greater, but was -1");
    }

    @Test
    void acceptsEqualMinAndMaxPrice() {
        ProductSearchCriteria criteria = withPrices("10000", "10000");

        assertThat(criteria.minPrice()).isEqualByComparingTo("10000");
        assertThat(criteria.maxPrice()).isEqualByComparingTo("10000");
    }

    private static ProductSearchCriteria criteria(String q, String sort) {
        return ProductSearchCriteria.of(q, null, null, null, null, sort);
    }

    private static ProductSearchCriteria withPrices(String minPrice, String maxPrice) {
        return ProductSearchCriteria.of(
                null,
                null,
                null,
                minPrice == null ? null : new BigDecimal(minPrice),
                maxPrice == null ? null : new BigDecimal(maxPrice),
                null);
    }
}
