package com.plaza.store.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Pure unit tests: no Spring, no database, they run in milliseconds. */
class PageParamsTest {

    @Test
    void acceptsTheLimits() {
        assertThat(new PageParams(0, 1).size()).isEqualTo(1);
        assertThat(new PageParams(0, 100).size()).isEqualTo(100);
    }

    @Test
    void rejectsNegativePage() {
        assertThatThrownBy(() -> new PageParams(-1, 20))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("page must be 0 or greater, but was -1");
    }

    @Test
    void rejectsSizeZero() {
        assertThatThrownBy(() -> new PageParams(0, 0))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("size must be between 1 and 100, but was 0");
    }

    @Test
    void rejectsSizeOverTheMaximum() {
        assertThatThrownBy(() -> new PageParams(0, 101))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("size must be between 1 and 100, but was 101");
    }

    @Test
    void offsetIsTheNumberOfRowsBeforeThePage() {
        assertThat(new PageParams(0, 20).offset()).isZero();
        assertThat(new PageParams(3, 20).offset()).isEqualTo(60);
    }

    @Test
    void totalPagesRoundsUp() {
        PageParams pageParams = new PageParams(0, 20);

        assertThat(PageResponse.of(List.of(), pageParams, 0).totalPages()).isZero();
        assertThat(PageResponse.of(List.of(), pageParams, 20).totalPages()).isEqualTo(1);
        assertThat(PageResponse.of(List.of(), pageParams, 21).totalPages()).isEqualTo(2);
        assertThat(PageResponse.of(List.of(), pageParams, 57).totalPages()).isEqualTo(3);
    }
}
