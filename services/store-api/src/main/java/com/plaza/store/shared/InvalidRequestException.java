package com.plaza.store.shared;

/** The client sent a request that cannot be processed. Becomes a 400 Bad Request. */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}
