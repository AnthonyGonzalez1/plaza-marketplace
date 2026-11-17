package com.plaza.store.shared;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on {@code @Scheduled} methods (background jobs). The tests switch it off with {@code
 * plaza.scheduling.enabled=false} and call the jobs directly, so no job changes data in the middle
 * of a test.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "plaza.scheduling.enabled", matchIfMissing = true)
public class SchedulingConfig {}
