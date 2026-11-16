package com.plaza.store.shared;

/** The requested resource does not exist. Becomes a 404 Not Found. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
